const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { join } = require('path');
const { existsSync, unlinkSync } = require('fs');
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const Image = require('../models/Image');
const { generateFilename, putObject, deleteObjects } = require('../services/storage');
const { authenticateToken, optionalAuthentication } = require('../middleware/auth');
const { checkFolderAccess } = require('../middleware/folderPermission');

const router = express.Router();

// Download route - uses optional authentication to support public folders
router.get('/:imageId/download', optionalAuthentication, async (req, res) => {
  try {
    // Read-only access check + URL lookup: .lean() returns a plain object
    // (no Mongoose hydration) which is faster and lighter; we never mutate here.
    const image = await Image.findById(req.params.imageId).populate('folder').lean();

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Check if user has access to the folder
    const folder = image.folder;

    // Allow access if folder is public (no authentication required)
    // Otherwise, require authentication and check permissions
    let hasAccess = folder.isPublic;

    if (!hasAccess && req.user) {
      hasAccess =
        folder.owner.toString() === req.user._id.toString() ||
        folder.permissions.some(p => p.user.toString() === req.user._id.toString()) ||
        req.user.role === 'admin';
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get the download URL and filename
    const downloadUrl = image.originalUrl || image.url;
    const downloadFilename = image.originalName || image.originalFilename || image.filename;

    // If it's an S3 URL, proxy the download to avoid CORS issues
    if (downloadUrl.includes('s3.') && process.env.AWS_ACCESS_KEY_ID) {
      console.log('[Download Proxy] Fetching from S3 via AWS SDK:', downloadUrl);

      try {
        // Extract bucket name and key from URL
        // URL format: https://bucket-name.s3.region.amazonaws.com/key
        const urlParts = downloadUrl.match(/https:\/\/([^.]+)\.s3\.[^.]+\.amazonaws\.com\/(.+)/);
        if (!urlParts) {
          console.error('[Download Proxy] Could not parse S3 URL:', downloadUrl);
          return res.status(500).json({ error: 'Invalid S3 URL format' });
        }

        const bucketName = urlParts[1];
        const objectKey = decodeURIComponent(urlParts[2]);

        console.log('[Download Proxy] Bucket:', bucketName, 'Key:', objectKey);

        // Initialize S3 client
        const s3Client = new S3Client({
          region: process.env.AWS_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        });

        // Get object from S3
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: objectKey
        });

        const s3Response = await s3Client.send(command);

        // Set response headers
        const contentType = s3Response.ContentType || 'application/octet-stream';
        const contentLength = s3Response.ContentLength;

        console.log('[Download Proxy] Content-Type:', contentType);
        console.log('[Download Proxy] Content-Length:', contentLength);

        // Convert stream to buffer (better compatibility with nginx/reverse proxies)
        const chunks = [];
        for await (const chunk of s3Response.Body) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        console.log('[Download Proxy] Buffered file size:', buffer.length, 'bytes');

        // Set headers and send buffer
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
        res.setHeader('Content-Length', buffer.length);

        console.log('[Download Proxy] Sending file:', downloadFilename);
        res.send(buffer);

        return; // Exit early to prevent continuing to the else block
      } catch (err) {
        console.error('[Download Proxy] AWS SDK error:', err);
        return res.status(500).json({ error: 'Failed to download file from S3' });
      }
    } else {
      // For local files, return the URL (no CORS issue)
      res.json({
        url: downloadUrl,
        filename: downloadFilename
      });
    }
  } catch (error) {
    console.error('Download image error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// All other routes require authentication
router.use(authenticateToken);

// S3 configuration
const USE_S3 = process.env.USE_S3 === 'true';
const s3Client = USE_S3 ? new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}) : null;
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const uploadsDir = join(__dirname, '..', 'uploads');

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Images only'), false);
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Send a JSON list with a strong, content-derived ETag and revalidation caching.
// On a repeat request for an unchanged folder the browser sends If-None-Match and
// we reply with a body-less 304 instead of re-sending the (often multi-KB) list —
// a cheap repeat-visit bandwidth win, which matters most on mobile. We hash the
// serialized payload (which already reflects per-user `isFavorited` flags), so the
// ETag changes whenever anything the user would see changes. Cache-Control is
// `private` (responses are user-specific) and `no-cache` (always revalidate via
// the conditional request rather than serving a stale copy).
const sendJsonCached = (req, res, payload) => {
  const body = JSON.stringify(payload);
  const etag = `"${crypto.createHash('sha1').update(body).digest('base64')}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, no-cache');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  return res.type('application/json').send(body);
};

// Upload image to folder
//
// Responds as soon as the image is viewable: the 300px grid thumbnail (~15ms of
// CPU) and the raw original are stored, and the row is saved as
// `processingStatus: 'pending'`. The expensive part — the AVIF/WebP rendition
// ladder, 8-50 CPU-seconds per photo — is left to services/renditionWorker.js,
// which reads the original back from storage one image at a time.
//
// This is what makes a 500-1000 image batch viable. Request time is now bounded
// by the upload itself instead of by how much encoding is queued ahead of it, so
// no request sits past the browser's timeout, and the server never holds more
// than one image's bytes in memory however deep the backlog gets.
router.post('/',
  upload.single('image'),
  checkFolderAccess('write'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Keys we are about to write, so a later failure can clean them up. Without
    // this, a store that succeeds followed by a save that throws leaves objects
    // nothing points at and we keep paying to hold them.
    const written = [];

    try {
      // Content-hash dedupe: fingerprint the raw bytes BEFORE any Sharp work so
      // an accidental re-upload of the same file into the same folder costs one
      // indexed lookup instead of a full re-encode + duplicate S3 object + row.
      // Hashing is cheap (~hundreds of MB/s) relative to the encode it can skip.
      const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

      const existing = await Image.findOne({ folder: req.folder._id, hash })
        .populate('uploadedBy', 'username email')
        .populate('folder', 'name');

      if (existing) {
        console.log(`[ImageUpload] Duplicate skipped (folder ${req.folder._id}): ${req.file.originalname}`);
        return res.status(200).json({
          message: 'Image already exists in this folder',
          duplicate: true,
          image: existing
        });
      }

      console.log(`[ImageUpload] ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

      const originalExt = req.file.originalname.split('.').pop().toLowerCase();
      const originalFilename = generateFilename(originalExt);

      // Local-storage URLs only: keep using the request's own host so a phone on
      // the LAN can still load dev images (the worker has no request and falls
      // back to BACKEND_URL).
      const baseUrl = `${req.protocol || 'http'}://${req.get('host') || `localhost:${process.env.PORT || 3001}`}`;

      // ARCHIVE COPY FIRST, on its own, before anything that can fail.
      // These are the bytes the browser sent, stored untouched — no resize, no
      // re-encode — and they are what the download route serves. Everything
      // below this line is display convenience. Sharp used to run first, which
      // meant a file it could not decode (iPhone HEIC, camera RAW) failed the
      // whole request and the original was never kept.
      const originalUrl = await putObject(req.file.buffer, originalFilename, req.file.mimetype, { baseUrl });
      written.push(originalFilename);

      // Grid thumbnail. Cheap (~15ms) so it stays in the request and a
      // just-uploaded image shows up immediately rather than as a blank tile.
      // If Sharp cannot read the file we keep the upload anyway: the grid falls
      // back to the original (see LazyImage) and the rendition worker will mark
      // the row failed, but the archive copy is already safe.
      let metadata = {};
      let thumbnail = null;
      try {
        metadata = await sharp(req.file.buffer).metadata();

        // resolveWithObject gives us the output dimensions without a second decode.
        const { data, info } = await sharp(req.file.buffer)
          .rotate()
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 75 }) // WebP is smaller than JPEG at the same quality
          .toBuffer({ resolveWithObject: true });

        const thumbnailFilename = generateFilename('webp');
        const thumbnailUrl = await putObject(data, thumbnailFilename, 'image/webp', {
          cacheControl: 'max-age=2592000, immutable', // 30 days, filename is unique
          baseUrl
        });
        written.push(thumbnailFilename);
        thumbnail = { url: thumbnailUrl, size: data.length, width: info.width, height: info.height };
      } catch (err) {
        console.error(
          `[ImageUpload] no display versions for ${req.file.originalname} ` +
          `(original IS stored): ${err.message}`
        );
      }

      const image = new Image({
        filename: originalFilename,
        originalName: req.file.originalname,
        url: originalUrl,
        originalUrl,
        displayUrl: originalUrl, // Same as original (raw image, no processing)
        size: req.file.size,
        originalSize: req.file.size,
        displaySize: req.file.size,
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        ...(thumbnail && {
          thumbnailUrl: thumbnail.url,
          thumbnailSize: thumbnail.size,
          thumbnailWidth: thumbnail.width,
          thumbnailHeight: thumbnail.height
        }),
        renditions: [], // filled in by the rendition worker
        hash,
        folder: req.folder._id,
        uploadedBy: req.user._id,
        processingStatus: 'pending' // rendition ladder still to come
      });

      await image.save();
      await image.populate('uploadedBy', 'username email');
      await image.populate('folder', 'name');

      res.status(201).json({
        message: 'Uploaded successfully',
        image
      });
    } catch (error) {
      console.error('Upload error:', error);
      await deleteObjects(written);
      res.status(500).json({ error: error.message });
    }
  }
);



// Encode/decode an opaque keyset cursor. The cursor is just the sort key of the
// last row returned — (uploadDate, _id) — base64'd so the client treats it as
// a black box. No PII, but base64 keeps it tidy and forward-compatible.
const encodeCursor = (img) =>
  Buffer.from(`${new Date(img.uploadDate).getTime()}_${img._id}`, 'utf8').toString('base64url');

const decodeCursor = (raw) => {
  try {
    const [ts, id] = Buffer.from(String(raw), 'base64url').toString('utf8').split('_');
    const date = new Date(Number(ts));
    if (Number.isNaN(date.getTime()) || !id) return null;
    return { date, id };
  } catch {
    return null;
  }
};

// Get images in a folder — keyset (cursor) pagination.
//
// Why not skip()? Offset pagination rescans and discards `skip` docs on every
// page, so deep pages on a large folder degrade badly (O(skip)). A keyset cursor
// on the {folder, uploadDate:-1, _id:-1} index walks straight to the boundary
// and reads only `limit` rows — flat cost regardless of how deep you scroll.
//
// Query string:
//   ?limit=100            page size (capped at 200)
//   ?cursor=<token>       omit for the first page; pass `nextCursor` for the rest
// Back-compat: a legacy ?page= request (no cursor) still returns the first page.
router.get('/folder/:folderId', checkFolderAccess('read'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;

    // Stable newest-first ordering. _id is the unique tiebreaker that makes the
    // cursor deterministic when several images share an uploadDate.
    const filter = { folder: req.folder._id };
    if (cursor) {
      // Everything strictly "after" the last row in (uploadDate desc, _id desc).
      filter.$or = [
        { uploadDate: { $lt: cursor.date } },
        { uploadDate: cursor.date, _id: { $lt: cursor.id } }
      ];
    }

    console.log(`[GetImages] folder=${req.folder._id} limit=${limit} cursor=${req.query.cursor || 'none'}`);

    // Fetch limit+1 to know whether another page exists without a second query.
    // .lean() skips Mongoose hydration (faster reads, less memory); already a
    // plain object so no per-image .toObject() needed.
    const rows = await Image.find(filter)
      .populate('uploadedBy', 'username email')
      .populate('folder', 'name')
      .sort({ uploadDate: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const images = hasMore ? rows.slice(0, limit) : rows;

    // Add isFavorited flag for current user and ensure absolute URLs. Note: we
    // intentionally keep the DB's stable date ordering here rather than hoisting
    // favorites to the top — a per-page favorites-first sort is inconsistent once
    // results span multiple infinite-scroll pages. The star flag still drives the
    // UI; global "favorites first" belongs to the dedicated favorites filter.
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const imagesWithFavorites = images.map(imgObj => {
      imgObj.isFavorited = (imgObj.favoritedBy || []).some(
        userId => userId.toString() === req.user._id.toString()
      );

      if (imgObj.url && imgObj.url.startsWith('/uploads/')) {
        imgObj.url = `${backendUrl}${imgObj.url}`;
      }

      return imgObj;
    });

    // Total is only needed for the header count; compute it once (first page) so
    // subsequent infinite-scroll fetches don't pay for a countDocuments scan.
    const total = cursor
      ? undefined
      : await Image.countDocuments({ folder: req.folder._id });

    sendJsonCached(req, res, {
      images: imagesWithFavorites,
      pagination: {
        limit,
        ...(total !== undefined && { total }),
        hasMore,
        nextCursor: hasMore ? encodeCursor(images[images.length - 1]) : null
      }
    });
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// Get all images accessible by user
router.get('/', async (req, res) => {
  try {
    const Folder = require('../models/Folder');

    // Get all folders user has access to (read-only: .lean() for plain objects)
    const folders = await Folder.find({
      $or: [
        { owner: req.user._id },
        { isPublic: true },
        { 'permissions.user': req.user._id }
      ]
    }).lean();

    const folderIds = folders.map(f => f._id);

    // Optional full-text search across filename + tags (?q=...). Uses the
    // image_text_search index ($text) — indexed and relevance-scored, unlike a
    // $regex scan. Always scoped to folders the user can access.
    const q = (req.query.q || '').trim();
    const baseFilter = { folder: { $in: folderIds } };

    let query;
    if (q) {
      query = Image.find(
        { ...baseFilter, $text: { $search: q } },
        { score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' } });
    } else {
      query = Image.find(baseFilter).sort({ uploadDate: -1 });
    }

    // .lean() — read-only list, no mutation; drops the per-image .toObject().
    const images = await query
      .populate('uploadedBy', 'username email')
      .populate('folder', 'name')
      .lean();

    // Add isFavorited flag for current user and ensure absolute URLs
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const imagesWithFavorites = images.map(imgObj => {
      imgObj.isFavorited = (imgObj.favoritedBy || []).some(
        userId => userId.toString() === req.user._id.toString()
      );

      // Convert relative URLs to absolute
      if (imgObj.url && imgObj.url.startsWith('/uploads/')) {
        imgObj.url = `${backendUrl}${imgObj.url}`;
      }

      return imgObj;
    });

    // For a search, preserve the DB's relevance (textScore) ordering. Otherwise
    // sort favorites first, then newest.
    if (!q) {
      imagesWithFavorites.sort((a, b) => {
        if (a.isFavorited && !b.isFavorited) return -1;
        if (!a.isFavorited && b.isFavorited) return 1;
        return new Date(b.uploadDate) - new Date(a.uploadDate);
      });
    }

    sendJsonCached(req, res, imagesWithFavorites);
  } catch (error) {
    console.error('Get all images error:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// Toggle favorite status
router.patch('/:imageId/favorite', async (req, res) => {
  try {
    const image = await Image.findById(req.params.imageId).populate('folder');

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Check if user has access to the folder
    const folder = image.folder;
    const hasAccess =
      folder.owner.toString() === req.user._id.toString() ||
      folder.isPublic ||
      folder.permissions.some(p => p.user.toString() === req.user._id.toString()) ||
      req.user.role === 'admin';

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Toggle favorite status
    const isFavorited = image.favoritedBy.some(
      userId => userId.toString() === req.user._id.toString()
    );

    if (isFavorited) {
      // Remove from favorites
      image.favoritedBy = image.favoritedBy.filter(
        userId => userId.toString() !== req.user._id.toString()
      );
    } else {
      // Add to favorites
      image.favoritedBy.push(req.user._id);
    }

    await image.save();

    res.json({
      message: isFavorited ? 'Removed from favorites' : 'Added to favorites',
      isFavorited: !isFavorited
    });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// Update tags for an image (requires write access to the folder)
router.patch('/:imageId/tags', async (req, res) => {
  try {
    const image = await Image.findById(req.params.imageId).populate('folder');

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Editing metadata requires write/admin access (read-only users cannot tag).
    const folder = image.folder;
    const isOwner = folder.owner.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const userPermission = folder.permissions.find(
      p => p.user.toString() === req.user._id.toString()
    );
    const canWrite = isOwner || isAdmin ||
      (userPermission && ['write', 'admin'].includes(userPermission.access));

    if (!canWrite) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Sanitize: coerce to strings, trim, lowercase, drop empties, de-dupe, and
    // cap length/count. This also neutralises any non-string/operator payloads.
    const raw = Array.isArray(req.body.tags) ? req.body.tags : [];
    const tags = [...new Set(
      raw
        .filter(t => typeof t === 'string')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length <= 40)
    )].slice(0, 30);

    image.tags = tags;
    await image.save();

    res.json({ message: 'Tags updated', tags: image.tags });
  } catch (error) {
    console.error('Update tags error:', error);
    res.status(500).json({ error: 'Failed to update tags' });
  }
});

// Delete image
router.delete('/:imageId', async (req, res) => {
  try {
    const image = await Image.findById(req.params.imageId).populate('folder');

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Check if user has permission to delete
    const folder = image.folder;
    const isOwner = folder.owner.toString() === req.user._id.toString();
    const isUploader = image.uploadedBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isUploader && !isAdmin) {
      // Check if user has write/admin permission
      const userPermission = folder.permissions.find(
        p => p.user.toString() === req.user._id.toString()
      );

      if (!userPermission || userPermission.access === 'read') {
        return res.status(403).json({ error: 'Permission denied' });
      }
    }

    // Delete from storage (display, original, thumbnail, and legacy files)
    if (USE_S3) {
      const deletePromises = [];

      // Delete display file (WebP)
      if (image.filename) {
        deletePromises.push(
          s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: image.filename
          }))
        );
      }

      // Delete original WebP file - extract filename from URL
      if (image.originalUrl) {
        const originalKey = image.originalUrl.split('/').pop();
        deletePromises.push(
          s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: originalKey
          }))
        );
      }

      // Delete thumbnail file if it exists
      if (image.thumbnailUrl) {
        const thumbnailKey = image.thumbnailUrl.split('/').pop();
        deletePromises.push(
          s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: thumbnailKey
          }))
        );
      }

      // Delete display renditions (AVIF/WebP/JPEG ladder)
      for (const r of image.renditions || []) {
        if (!r.url) continue;
        deletePromises.push(
          s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: r.url.split('/').pop()
          }))
        );
      }

      // Delete legacy originalFilename if it exists
      if (image.originalFilename) {
        deletePromises.push(
          s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: image.originalFilename
          }))
        );
      }

      await Promise.all(deletePromises);
    } else {
      // Delete display file
      if (image.filename) {
        const filePath = join(uploadsDir, image.filename);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      }

      // Delete original WebP file - extract filename from URL
      if (image.originalUrl) {
        const originalFilename = image.originalUrl.split('/').pop();
        const originalPath = join(uploadsDir, originalFilename);
        if (existsSync(originalPath)) {
          unlinkSync(originalPath);
        }
      }

      // Delete thumbnail file if it exists
      if (image.thumbnailUrl) {
        const thumbnailFilename = image.thumbnailUrl.split('/').pop();
        const thumbnailPath = join(uploadsDir, thumbnailFilename);
        if (existsSync(thumbnailPath)) {
          unlinkSync(thumbnailPath);
        }
      }

      // Delete display renditions (AVIF/WebP/JPEG ladder)
      for (const r of image.renditions || []) {
        if (!r.url) continue;
        const rPath = join(uploadsDir, r.url.split('/').pop());
        if (existsSync(rPath)) {
          unlinkSync(rPath);
        }
      }

      // Delete legacy originalFilename if it exists
      if (image.originalFilename) {
        const legacyOriginalPath = join(uploadsDir, image.originalFilename);
        if (existsSync(legacyOriginalPath)) {
          unlinkSync(legacyOriginalPath);
        }
      }
    }

    // Delete from database
    await Image.deleteOne({ _id: image._id });

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

module.exports = router;

