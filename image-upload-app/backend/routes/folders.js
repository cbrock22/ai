const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const Folder = require('../models/Folder');
const Image = require('../models/Image');
const { authenticateToken } = require('../middleware/auth');
const { checkFolderAccess } = require('../middleware/folderPermission');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { existsSync, unlinkSync } = require('fs');
const { join } = require('path');

const router = express.Router();

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
const uploadsDir = join(__dirname, '../uploads');

// Check if public folder requires password
router.get('/public/:folderId/check', async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.folderId).select('+password');

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (!folder.isPublic) {
      return res.status(403).json({ error: 'This folder is not public' });
    }

    res.json({
      requiresPassword: !!folder.password,
      name: folder.name,
      owner: folder.owner
    });
  } catch (error) {
    console.error('Check public folder error:', error);
    res.status(500).json({ error: 'Failed to check folder' });
  }
});

// Verify password for public folder
router.post('/public/:folderId/verify', async (req, res) => {
  try {
    const { password } = req.body;
    const folder = await Folder.findById(req.params.folderId).select('+password');

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (!folder.isPublic) {
      return res.status(403).json({ error: 'This folder is not public' });
    }

    // If folder has no password, access is granted
    if (!folder.password) {
      return res.json({ verified: true });
    }

    // Check password
    const isValid = await bcrypt.compare(password, folder.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    res.json({ verified: true });
  } catch (error) {
    console.error('Verify password error:', error);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// Get folders for public gallery (no authentication required)
router.get('/public-gallery', async (req, res) => {
  try {
    // Find all folders marked for public gallery display
    const folders = await Folder.find({
      isPublic: true,
      displayOnPublicGallery: true
    })
    .populate('owner', 'username email')
    .sort({ createdAt: -1 });

    // Enhance folders with image counts and preview images (10 images)
    const foldersWithImages = await Promise.all(
      folders.map(async (folder) => {
        const folderObj = folder.toObject();

        // Get image count
        folderObj.imageCount = await Image.countDocuments({ folder: folder._id });

        // Get first 10 images for preview
        const previewImages = await Image.find({ folder: folder._id })
          .select('url filename thumbnailUrl')
          .limit(10)
          .sort({ uploadDate: -1 });

        // Ensure URLs are absolute
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
        folderObj.previewImages = previewImages.map(img => {
          const imgObj = img.toObject();
          if (imgObj.url && imgObj.url.startsWith('/uploads/')) {
            imgObj.url = `${backendUrl}${imgObj.url}`;
          }
          if (imgObj.thumbnailUrl && imgObj.thumbnailUrl.startsWith('/uploads/')) {
            imgObj.thumbnailUrl = `${backendUrl}${imgObj.thumbnailUrl}`;
          }
          return imgObj;
        });

        return folderObj;
      })
    );

    res.json(foldersWithImages);
  } catch (error) {
    console.error('Get public gallery folders error:', error);
    res.status(500).json({ error: 'Failed to fetch public gallery folders' });
  }
});

// Public folder viewing route (no authentication required, but may need password)
router.get('/public/:folderId', async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.folderId)
      .populate('owner', 'username email');

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (!folder.isPublic) {
      return res.status(403).json({ error: 'This folder is not public' });
    }

    // Get images in this folder
    const images = await Image.find({ folder: folder._id })
      .populate('uploadedBy', 'username email')
      .sort({ uploadDate: -1 });

    // Ensure URLs are absolute
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
    const imagesWithAbsoluteUrls = images.map(img => {
      const imgObj = img.toObject();
      if (imgObj.url && imgObj.url.startsWith('/uploads/')) {
        imgObj.url = `${backendUrl}${imgObj.url}`;
      }
      return imgObj;
    });

    const folderObj = folder.toObject();
    folderObj.imageCount = images.length;
    folderObj.images = imagesWithAbsoluteUrls;

    res.json(folderObj);
  } catch (error) {
    console.error('Get public folder error:', error);
    res.status(500).json({ error: 'Failed to fetch folder' });
  }
});

// All routes below require authentication
router.use(authenticateToken);

// Get all folders accessible by user
router.get('/', async (req, res) => {
  try {
    // Admins can see all folders
    const query = req.user.role === 'admin'
      ? {}
      : {
          $or: [
            { owner: req.user._id },
            { isPublic: true },
            { 'permissions.user': req.user._id }
          ]
        };

    const folders = await Folder.find(query)
    .populate('owner', 'username email')
    .sort({ createdAt: -1 });

    // Enhance folders with image counts and preview images
    const foldersWithImages = await Promise.all(
      folders.map(async (folder) => {
        const folderObj = folder.toObject();

        // Get image count
        folderObj.imageCount = await Image.countDocuments({ folder: folder._id });

        // Get first 3 images for preview
        const previewImages = await Image.find({ folder: folder._id })
          .select('url filename')
          .limit(3)
          .sort({ uploadDate: -1 });

        // Ensure URLs are absolute
        folderObj.previewImages = previewImages.map(img => {
          const imgObj = img.toObject();
          if (imgObj.url && imgObj.url.startsWith('/uploads/')) {
            // Convert relative URL to absolute
            const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
            imgObj.url = `${backendUrl}${imgObj.url}`;
          }
          return imgObj;
        });

        // Add permission flags for current user
        const isOwner = folder.owner._id.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        const userPermission = folder.permissions.find(
          p => p.user && p.user.toString() === req.user._id.toString()
        );

        // Admins have full permissions on all folders
        folderObj.canWrite = isAdmin || isOwner ||
          (userPermission && ['write', 'admin'].includes(userPermission.access));
        folderObj.canDelete = isAdmin || isOwner ||
          (userPermission && userPermission.access === 'admin');
        folderObj.isOwner = isOwner;
        folderObj.isAdmin = isAdmin;

        return folderObj;
      })
    );

    res.json(foldersWithImages);
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create new folder
router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Folder name required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, isPublic, displayOnPublicGallery, password } = req.body;

      // Check if folder already exists for this user
      const existingFolder = await Folder.findOne({
        name,
        owner: req.user._id
      });

      if (existingFolder) {
        return res.status(400).json({ error: 'Folder already exists' });
      }

      const folderData = {
        name,
        owner: req.user._id,
        isPublic: isPublic || false,
        displayOnPublicGallery: displayOnPublicGallery || false
      };

      // Hash password if provided
      if (password && password.trim()) {
        folderData.password = await bcrypt.hash(password, 10);
      }

      const folder = new Folder(folderData);

      await folder.save();
      await folder.populate('owner', 'username email');

      // Don't send password back
      const folderResponse = folder.toObject();
      delete folderResponse.password;

      res.status(201).json({
        message: 'Folder created successfully',
        folder: folderResponse
      });
    } catch (error) {
      console.error('Create folder error:', error);
      res.status(500).json({ error: 'Failed to create folder' });
    }
  }
);

// Get folder by ID
router.get('/:folderId', checkFolderAccess('read'), async (req, res) => {
  try {
    await req.folder.populate('owner', 'username email');
    await req.folder.populate('permissions.user', 'username email');
    res.json(req.folder);
  } catch (error) {
    console.error('Get folder error:', error);
    res.status(500).json({ error: 'Failed to fetch folder' });
  }
});

// Update folder
router.put('/:folderId',
  checkFolderAccess('admin'),
  [
    body('name').optional().trim().notEmpty().withMessage('Folder name cannot be empty')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, isPublic, displayOnPublicGallery, password, removePassword } = req.body;

      if (name) req.folder.name = name;
      if (typeof isPublic !== 'undefined') req.folder.isPublic = isPublic;
      if (typeof displayOnPublicGallery !== 'undefined') req.folder.displayOnPublicGallery = displayOnPublicGallery;

      // Handle password changes
      if (removePassword) {
        req.folder.password = undefined;
      } else if (password && password.trim()) {
        req.folder.password = await bcrypt.hash(password, 10);
      }

      await req.folder.save();
      await req.folder.populate('owner', 'username email');

      // Don't send password back
      const folderResponse = req.folder.toObject();
      delete folderResponse.password;

      res.json({
        message: 'Folder updated successfully',
        folder: folderResponse
      });
    } catch (error) {
      console.error('Update folder error:', error);
      res.status(500).json({ error: 'Failed to update folder' });
    }
  }
);

// Delete folder (cascade delete all images and S3 objects)
router.delete('/:folderId', checkFolderAccess('admin'), async (req, res) => {
  try {
    // Get all images in this folder
    const images = await Image.find({ folder: req.folder._id });

    // Delete each image from storage (S3 or local) - compressed, original, and thumbnail
    for (const image of images) {
      try {
        if (USE_S3) {
          // Delete compressed file
          const command = new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: image.filename
          });
          await s3Client.send(command);

          // Delete original file if it exists
          if (image.originalFilename) {
            const originalCommand = new DeleteObjectCommand({
              Bucket: S3_BUCKET,
              Key: image.originalFilename
            });
            await s3Client.send(originalCommand);
          }

          // Delete thumbnail file if it exists
          // Thumbnails are named with -thumb.webp suffix
          const thumbnailFilename = image.filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '-thumb.webp');
          try {
            const thumbCommand = new DeleteObjectCommand({
              Bucket: S3_BUCKET,
              Key: thumbnailFilename
            });
            await s3Client.send(thumbCommand);
          } catch (thumbError) {
            // Thumbnail might not exist yet, that's okay
            console.log(`Thumbnail ${thumbnailFilename} not found or already deleted`);
          }
        } else {
          // Delete compressed file
          const filePath = join(uploadsDir, image.filename);
          if (existsSync(filePath)) {
            unlinkSync(filePath);
          }

          // Delete original file if it exists
          if (image.originalFilename) {
            const originalPath = join(uploadsDir, image.originalFilename);
            if (existsSync(originalPath)) {
              unlinkSync(originalPath);
            }
          }

          // Delete thumbnail file if it exists
          const thumbnailFilename = image.filename.replace(/\.(jpg|jpeg|png|gif)$/i, '-thumb.webp');
          const thumbnailPath = join(uploadsDir, thumbnailFilename);
          if (existsSync(thumbnailPath)) {
            unlinkSync(thumbnailPath);
          }
        }
      } catch (deleteError) {
        console.error(`Failed to delete image ${image.filename}:`, deleteError);
        // Continue deleting other images even if one fails
      }
    }

    // Delete all image records from database
    await Image.deleteMany({ folder: req.folder._id });

    // Delete the folder
    await Folder.deleteOne({ _id: req.folder._id });

    res.json({
      message: 'Folder and all images deleted successfully',
      deletedImages: images.length
    });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Add user permission to folder
router.post('/:folderId/permissions',
  checkFolderAccess('admin'),
  [
    body('userId').notEmpty().withMessage('User ID required'),
    body('access').isIn(['read', 'write', 'admin']).withMessage('Invalid access level')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId, access } = req.body;

      // Check if permission already exists
      const existingPermission = req.folder.permissions.find(
        p => p.user.toString() === userId
      );

      if (existingPermission) {
        existingPermission.access = access;
      } else {
        req.folder.permissions.push({ user: userId, access });
      }

      await req.folder.save();
      await req.folder.populate('permissions.user', 'username email');

      res.json({
        message: 'Permission added successfully',
        folder: req.folder
      });
    } catch (error) {
      console.error('Add permission error:', error);
      res.status(500).json({ error: 'Failed to add permission' });
    }
  }
);

// Remove user permission from folder
router.delete('/:folderId/permissions/:userId',
  checkFolderAccess('admin'),
  async (req, res) => {
    try {
      const { userId } = req.params;

      req.folder.permissions = req.folder.permissions.filter(
        p => p.user.toString() !== userId
      );

      await req.folder.save();

      res.json({
        message: 'Permission removed successfully',
        folder: req.folder
      });
    } catch (error) {
      console.error('Remove permission error:', error);
      res.status(500).json({ error: 'Failed to remove permission' });
    }
  }
);

module.exports = router;
