const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { join } = require('path');
const { existsSync, unlinkSync } = require('fs');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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
        // Generate filenames
        const originalFilename = generateFilename('webp');
        const displayFilename = generateFilename('webp');

        // Get image metadata
        const metadata = await sharp(req.file.buffer).metadata();

        // Create ORIGINAL: WebP Lossless (full resolution) - for download
        const originalBuffer = await sharp(req.file.buffer)
          .rotate()
          .webp({ lossless: true })
          .toBuffer();

        // Create DISPLAY: WebP Lossless (2400x2400 max) - for lightbox viewing
        const displayBuffer = await sharp(req.file.buffer)
          .rotate()
          .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
          .webp({ lossless: true })
          .toBuffer();

        console.log(`[ImageUpload] Completed processing: ${req.file.originalname}`);
        return { originalFilename, displayFilename, metadata, originalBuffer, displayBuffer };
      });

      const { originalFilename, displayFilename, metadata, originalBuffer, displayBuffer } = result;
      console.log(`[ImageUpload] Uploading to storage: ${req.file.originalname}`);

      let originalUrl, displayUrl;

      if (USE_S3) {
        // Upload original lossless version to S3
        const originalUpload = new Upload({
          client: s3Client,
          params: {
            Bucket: S3_BUCKET,
            Key: originalFilename,
            Body: originalBuffer,
            ContentType: 'image/webp',
            CacheControl: 'max-age=604800'
          }
        });

        // Upload display lossless version to S3
        const displayUpload = new Upload({
          client: s3Client,
          params: {
            Bucket: S3_BUCKET,
            Key: displayFilename,
            Body: displayBuffer,
            ContentType: 'image/webp',
            CacheControl: 'max-age=604800'
          }
        });

        await Promise.all([originalUpload.done(), displayUpload.done()]);

        originalUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${originalFilename}`;
        displayUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${displayFilename}`;
      } else {
        // Save both versions locally
        const fs = require('fs').promises;
        await Promise.all([
          fs.writeFile(join(uploadsDir, originalFilename), originalBuffer),
          fs.writeFile(join(uploadsDir, displayFilename), displayBuffer)
        ]);

        // Construct full URLs for Docker/development environments
        const protocol = req.protocol || 'http';
        const host = req.get('host') || `localhost:${process.env.PORT || 3001}`;
        originalUrl = `${protocol}://${host}/uploads/${originalFilename}`;
        displayUrl = `${protocol}://${host}/uploads/${displayFilename}`;
      }

      // Save to database
      const image = new Image({
        filename: displayFilename,
        originalName: req.file.originalname,
        originalUrl,
        originalSize: originalBuffer.length,
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        displayUrl,
        displaySize: displayBuffer.length,
        folder: req.folder._id,
        uploadedBy: req.user._id,
        processingStatus: 'pending' // Thumbnail will be generated async
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

// Get images in a folder
router.get('/folder/:folderId', checkFolderAccess('read'), async (req, res) => {
  try {
    const images = await Image.find({ folder: req.folder._id })
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

    // Return the original file URL or fall back to compressed if original doesn't exist
    const downloadUrl = image.originalUrl || image.url;
    const downloadFilename = image.originalFilename || image.filename;

    res.json({
      url: downloadUrl,
      filename: image.originalName || downloadFilename
    });
  } catch (error) {
    console.error('Download image error:', error);
    res.status(500).json({ error: 'Failed to get download link' });
  }
});

module.exports = router;
