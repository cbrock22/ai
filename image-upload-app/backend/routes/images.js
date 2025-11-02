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
const generateFilename = () => `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;

// Upload image to folder
router.post('/',
  upload.single('image'),
  checkFolderAccess('write'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const filename = generateFilename();
      const compressedBuffer = await sharp(req.file.buffer)
        .rotate()
        .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true, mozjpeg: true })
        .toBuffer();

      let url;

      if (USE_S3) {
        // Upload to S3
        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: S3_BUCKET,
            Key: filename,
            Body: compressedBuffer,
            ContentType: 'image/jpeg',
            CacheControl: 'max-age=604800'
          }
        });

        await upload.done();
        url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filename}`;
      } else {
        // Save locally
        const fs = require('fs').promises;
        await fs.writeFile(join(uploadsDir, filename), compressedBuffer);

        // Construct full URL for Docker/development environments
        const protocol = req.protocol || 'http';
        const host = req.get('host') || `localhost:${process.env.PORT || 3001}`;
        url = `${protocol}://${host}/uploads/${filename}`;
      }

      // Save to database
      const image = new Image({
        filename,
        originalName: req.file.originalname,
        url,
        folder: req.folder._id,
        uploadedBy: req.user._id,
        size: compressedBuffer.length
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
      res.status(500).json({ error: error.message });
    }
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

    // Delete from storage
    if (USE_S3) {
      const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: image.filename
      });
      await s3Client.send(command);
    } else {
      const filePath = join(uploadsDir, image.filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
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
