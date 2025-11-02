const express = require('express');
const { body, validationResult } = require('express-validator');
const Folder = require('../models/Folder');
const Image = require('../models/Image');
const { authenticateToken } = require('../middleware/auth');
const { checkFolderAccess } = require('../middleware/folderPermission');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all folders accessible by user
router.get('/', async (req, res) => {
  try {
    const folders = await Folder.find({
      $or: [
        { owner: req.user._id },
        { isPublic: true },
        { 'permissions.user': req.user._id }
      ]
    })
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
          p => p.user.toString() === req.user._id.toString()
        );

        folderObj.canWrite = isOwner || isAdmin ||
          (userPermission && ['write', 'admin'].includes(userPermission.access));
        folderObj.canDelete = isOwner || isAdmin ||
          (userPermission && userPermission.access === 'admin');

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
      const { name, isPublic } = req.body;

      // Check if folder already exists for this user
      const existingFolder = await Folder.findOne({
        name,
        owner: req.user._id
      });

      if (existingFolder) {
        return res.status(400).json({ error: 'Folder already exists' });
      }

      const folder = new Folder({
        name,
        owner: req.user._id,
        isPublic: isPublic || false
      });

      await folder.save();
      await folder.populate('owner', 'username email');

      res.status(201).json({
        message: 'Folder created successfully',
        folder
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
      const { name, isPublic } = req.body;

      if (name) req.folder.name = name;
      if (typeof isPublic !== 'undefined') req.folder.isPublic = isPublic;

      await req.folder.save();
      await req.folder.populate('owner', 'username email');

      res.json({
        message: 'Folder updated successfully',
        folder: req.folder
      });
    } catch (error) {
      console.error('Update folder error:', error);
      res.status(500).json({ error: 'Failed to update folder' });
    }
  }
);

// Delete folder
router.delete('/:folderId', checkFolderAccess('admin'), async (req, res) => {
  try {
    // Check if folder has images
    const imageCount = await Image.countDocuments({ folder: req.folder._id });

    if (imageCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete folder with images. Delete images first.'
      });
    }

    await Folder.deleteOne({ _id: req.folder._id });

    res.json({ message: 'Folder deleted successfully' });
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
