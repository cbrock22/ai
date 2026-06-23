const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { join } = require('path');
const { existsSync, unlinkSync } = require('fs');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const Image = require('../models/Image');
const { generateRenditions } = require('../services/renditions');
const { authenticateToken, optionalAuthentication } = require('../middleware/auth');
const { checkFolderAccess } = require('../middleware/folderPermission');

// Toggle for the responsive display ladder (AVIF/WebP/JPEG). On by default;
// set DISPLAY_RENDITIONS=false to skip the extra encode work if needed.
const GENERATE_RENDITIONS = process.env.DISPLAY_RENDITIONS !== 'false';

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

// Processing queue to prevent memory exhaustion
class ImageProcessingQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const { task, resolve, reject } = this.queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      // Process next item
      if (this.queue.length > 0) {
        setImmediate(() => this.process());
      }
    }
  }
}

const imageQueue = new ImageProcessingQueue();

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

// Helper: Generate unique filename
const generateFilename = (ext = 'jpg') => `${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;

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
router.post('/',
  upload.single('image'),
  checkFolderAccess('write'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

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

      console.log(`[ImageUpload] Queuing image: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

      // Queue the image processing to prevent memory exhaustion
      const result = await imageQueue.add(async () => {
        console.log(`[ImageUpload] Processing: ${req.file.originalname}`);

        // Get original file extension
        const originalExt = req.file.originalname.split('.').pop().toLowerCase();
        const originalFilename = generateFilename(originalExt);

        // Get image metadata (lightweight operation)
        const metadata = await sharp(req.file.buffer).metadata();

        // Only create thumbnail (300x300 max) - optimized for fast loading
        const thumbnailSharp = sharp(req.file.buffer)
          .rotate()
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 75 }); // WebP is smaller than JPEG with same quality

        const thumbnailBuffer = await thumbnailSharp.toBuffer();
        const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();

        // Responsive display ladder (AVIF/WebP/JPEG) for the lightbox view.
        // Generated in the same queued task to bound concurrent CPU use.
        const renditions = GENERATE_RENDITIONS
          ? await generateRenditions(req.file.buffer)
          : [];

        console.log(`[ImageUpload] Completed processing: ${req.file.originalname} (${renditions.length} renditions)`);
        return {
          originalFilename,
          thumbnailBuffer,
          thumbnailWidth: thumbnailMetadata.width,
          thumbnailHeight: thumbnailMetadata.height,
          renditions,
          metadata
        };
      });

      const { originalFilename, thumbnailBuffer, thumbnailWidth, thumbnailHeight, renditions, metadata } = result;
      console.log(`[ImageUpload] Uploading to storage: ${req.file.originalname}`);

      const thumbnailFilename = generateFilename('webp');
      let originalUrl, thumbnailUrl;

      if (USE_S3) {
        // Upload raw original file to S3 (no compression)
        const originalUpload = new Upload({
          client: s3Client,
          params: {
            Bucket: S3_BUCKET,
            Key: originalFilename,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            CacheControl: 'max-age=604800'
          }
        });

        // Upload thumbnail to S3
        const thumbnailUpload = new Upload({
          client: s3Client,
          params: {
            Bucket: S3_BUCKET,
            Key: thumbnailFilename,
            Body: thumbnailBuffer,
            ContentType: 'image/webp',
            CacheControl: 'max-age=2592000, immutable' // 30 days, immutable for better caching
          }
        });

        await Promise.all([originalUpload.done(), thumbnailUpload.done()]);

        originalUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${originalFilename}`;
        thumbnailUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${thumbnailFilename}`;
      } else {
        // Save both versions locally
        const fs = require('fs').promises;
        await Promise.all([
          fs.writeFile(join(uploadsDir, originalFilename), req.file.buffer),
          fs.writeFile(join(uploadsDir, thumbnailFilename), thumbnailBuffer)
        ]);

        // Construct full URLs for Docker/development environments
        const protocol = req.protocol || 'http';
        const host = req.get('host') || `localhost:${process.env.PORT || 3001}`;
        originalUrl = `${protocol}://${host}/uploads/${originalFilename}`;
        thumbnailUrl = `${protocol}://${host}/uploads/${thumbnailFilename}`;
      }

      // Upload the display renditions (AVIF/WebP/JPEG ladder) in parallel and
      // collect their records for the DB. Long, immutable cache: filenames are
      // content-unique so they can be cached aggressively.
      const region = process.env.AWS_REGION || 'us-east-1';
      const renditionRecords = await Promise.all(renditions.map(async (r) => {
        const rFilename = generateFilename(r.ext);
        let rUrl;
        if (USE_S3) {
          await new Upload({
            client: s3Client,
            params: {
              Bucket: S3_BUCKET,
              Key: rFilename,
              Body: r.buffer,
              ContentType: r.contentType,
              CacheControl: 'max-age=2592000, immutable' // 30 days
            }
          }).done();
          rUrl = `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${rFilename}`;
        } else {
          const fs = require('fs').promises;
          await fs.writeFile(join(uploadsDir, rFilename), r.buffer);
          const protocol = req.protocol || 'http';
          const host = req.get('host') || `localhost:${process.env.PORT || 3001}`;
          rUrl = `${protocol}://${host}/uploads/${rFilename}`;
        }
        return { url: rUrl, format: r.format, width: r.width, height: r.height, size: r.size };
      }));

      // Save to database
      const image = new Image({
        filename: originalFilename,
        originalName: req.file.originalname,
        url: originalUrl,
        originalUrl,
        displayUrl: originalUrl, // Same as original (raw image, no processing)
        size: req.file.size,
        originalSize: req.file.size,
        displaySize: req.file.size, // Same as original (raw image, no processing)
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        thumbnailUrl,
        thumbnailSize: thumbnailBuffer.length,
        thumbnailWidth,
        thumbnailHeight,
        renditions: renditionRecords,
        hash,
        folder: req.folder._id,
        uploadedBy: req.user._id,
        processingStatus: 'completed' // Thumbnail generated synchronously
      });

      await image.save();
      await image.populate('uploadedBy', 'username email');
      await image.populate('folder', 'name');

      console.log(`[ImageUpload] Success: ${req.file.originalname} - Queue length: ${imageQueue.queue.length}`);

      res.status(201).json({
        message: 'Uploaded successfully',
        image
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Bulk upload endpoint - accepts multiple files, processes asynchronously
router.post('/bulk',
  upload.array('images', 20),  // Accept up to 20 images
  checkFolderAccess('write'),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadId = `upload-${Date.now()}-${Math.round(Math.random() * 1E9)}`;

    // Return immediately with 202 Accepted
    res.status(202).json({
      uploadId,
      message: 'Upload accepted, processing in background',
      totalFiles: req.files.length
    });

    // Process files asynchronously without blocking
    setImmediate(async () => {
      const results = [];

      for (const file of req.files) {
        try {
          // Folder-scoped dedupe (same fingerprint as the single-upload path):
          // skip identical re-uploads before doing any Sharp/S3 work.
          const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
          const duplicate = await Image.findOne({ folder: req.folder._id, hash }).lean();
          if (duplicate) {
            console.log(`[BulkUpload] ${uploadId}: Duplicate skipped ${file.originalname}`);
            results.push({ success: true, duplicate: true, filename: file.originalname });
            continue;
          }

          // Get original file extension
          const originalExt = file.originalname.split('.').pop().toLowerCase();
          const originalFilename = generateFilename(originalExt);
          const compressedFilename = generateFilename('jpg');

          // Since client already compressed, we can skip heavy compression
          // Just ensure proper format and size limits
          const compressedBuffer = await sharp(file.buffer)
            .rotate()
            .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, progressive: true, mozjpeg: true })
            .toBuffer();

          let url, originalUrl;

          if (USE_S3) {
            // Upload compressed version to S3
            const compressedUpload = new Upload({
              client: s3Client,
              params: {
                Bucket: S3_BUCKET,
                Key: compressedFilename,
                Body: compressedBuffer,
                ContentType: 'image/jpeg',
                CacheControl: 'max-age=604800'
              }
            });

            // Upload original uncompressed version to S3
            const originalUpload = new Upload({
              client: s3Client,
              params: {
                Bucket: S3_BUCKET,
                Key: originalFilename,
                Body: file.buffer,
                ContentType: file.mimetype,
                CacheControl: 'max-age=604800'
              }
            });

            await Promise.all([compressedUpload.done(), originalUpload.done()]);

            url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${compressedFilename}`;
            originalUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${originalFilename}`;
          } else {
            // Save both versions locally
            const fs = require('fs').promises;
            await Promise.all([
              fs.writeFile(join(uploadsDir, compressedFilename), compressedBuffer),
              fs.writeFile(join(uploadsDir, originalFilename), file.buffer)
            ]);

            const protocol = 'http'; // Default for local
            const host = `localhost:${process.env.PORT || 3001}`;
            url = `${protocol}://${host}/uploads/${compressedFilename}`;
            originalUrl = `${protocol}://${host}/uploads/${originalFilename}`;
          }

          // Save to database
          const image = new Image({
            filename: compressedFilename,
            originalName: file.originalname,
            url,
            originalFilename,
            originalUrl,
            originalSize: file.size,
            hash,
            folder: req.folder._id,
            uploadedBy: req.user._id,
            size: compressedBuffer.length,
            processingStatus: 'completed'
          });

          await image.save();
          results.push({ success: true, filename: file.originalname });
          console.log(`[BulkUpload] ${uploadId}: Processed ${file.originalname}`);
        } catch (error) {
          console.error(`[BulkUpload] ${uploadId}: Failed ${file.originalname}:`, error);
          results.push({ success: false, filename: file.originalname, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`[BulkUpload] ${uploadId}: Complete - ${successCount}/${req.files.length} succeeded`);
    });
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

