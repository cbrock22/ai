const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { join } = require('path');
const { existsSync, unlinkSync } = require('fs');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const Image = require('../models/Image');
const { authenticateToken } = require('../middleware/auth');
const { checkFolderAccess } = require('../middleware/folderPermission');

const router = express.Router();

// All routes require authentication
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

// Upload image to folder
router.post('/',
  upload.single('image'),
  checkFolderAccess('write'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
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

        console.log(`[ImageUpload] Completed processing: ${req.file.originalname}`);
        return {
          originalFilename,
          thumbnailBuffer,
          thumbnailWidth: thumbnailMetadata.width,
          thumbnailHeight: thumbnailMetadata.height,
          metadata
        };
      });

      const { originalFilename, thumbnailBuffer, thumbnailWidth, thumbnailHeight, metadata } = result;
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

// Get images in a folder (with pagination)
router.get('/folder/:folderId', checkFolderAccess('read'), async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; // Default 50 images per page
    const skip = (page - 1) * limit;

    console.log(`[GetImages] Fetching page ${page}, limit ${limit}, skip ${skip}`);

    // Get total count first
    const totalCount = await Image.countDocuments({ folder: req.folder._id });

    // Fetch images with pagination
    const images = await Image.find({ folder: req.folder._id })
      .populate('uploadedBy', 'username email')
      .populate('folder', 'name')
      .sort({ uploadDate: -1 })
      .skip(skip)
      .limit(limit);

    // Add isFavorited flag for current user and ensure absolute URLs
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const imagesWithFavorites = images.map(img => {
      const imgObj = img.toObject();
      imgObj.isFavorited = img.favoritedBy.some(
        userId => userId.toString() === req.user._id.toString()
      );

      // Convert relative URLs to absolute
      if (imgObj.url && imgObj.url.startsWith('/uploads/')) {
        imgObj.url = `${backendUrl}${imgObj.url}`;
      }

      return imgObj;
    });

    // Sort: favorites first, then by upload date
    imagesWithFavorites.sort((a, b) => {
      if (a.isFavorited && !b.isFavorited) return -1;
      if (!a.isFavorited && b.isFavorited) return 1;
      return new Date(b.uploadDate) - new Date(a.uploadDate);
    });

    // Return paginated response with metadata
    res.json({
      images: imagesWithFavorites,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + images.length < totalCount
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

    // Get all folders user has access to
    const folders = await Folder.find({
      $or: [
        { owner: req.user._id },
        { isPublic: true },
        { 'permissions.user': req.user._id }
      ]
    });

    const folderIds = folders.map(f => f._id);

    const images = await Image.find({ folder: { $in: folderIds } })
      .populate('uploadedBy', 'username email')
      .populate('folder', 'name')
      .sort({ uploadDate: -1 });

    // Add isFavorited flag for current user and ensure absolute URLs
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const imagesWithFavorites = images.map(img => {
      const imgObj = img.toObject();
      imgObj.isFavorited = img.favoritedBy.some(
        userId => userId.toString() === req.user._id.toString()
      );

      // Convert relative URLs to absolute
      if (imgObj.url && imgObj.url.startsWith('/uploads/')) {
        imgObj.url = `${backendUrl}${imgObj.url}`;
      }

      return imgObj;
    });

    // Sort: favorites first, then by upload date
    imagesWithFavorites.sort((a, b) => {
      if (a.isFavorited && !b.isFavorited) return -1;
      if (!a.isFavorited && b.isFavorited) return 1;
      return new Date(b.uploadDate) - new Date(a.uploadDate);
    });

    res.json(imagesWithFavorites);
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

// Download original uncompressed image
router.get('/:imageId/download', async (req, res) => {
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

module.exports = router;
