const Folder = require('../models/Folder');

// Check if user has access to a folder
const checkFolderAccess = (requiredAccess = 'read') => {
  return async (req, res, next) => {
    try {
      const folderId = req.params.folderId || req.body.folderId || req.query.folderId;

      if (!folderId) {
        return res.status(400).json({ error: 'Folder ID required' });
      }

      const folder = await Folder.findById(folderId);

      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      // Admins have full access
      if (req.user.role === 'admin') {
        req.folder = folder;
        return next();
      }

      // Check if user is the owner
      if (folder.owner.toString() === req.user._id.toString()) {
        req.folder = folder;
        return next();
      }

      // Check if folder is public and only read access is required
      if (folder.isPublic && requiredAccess === 'read') {
        req.folder = folder;
        return next();
      }

      // Check user permissions
      const userPermission = folder.permissions.find(
        p => p.user.toString() === req.user._id.toString()
      );

      if (!userPermission) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check if user has required access level
      const accessLevels = { read: 1, write: 2, admin: 3 };
      const userLevel = accessLevels[userPermission.access];
      const requiredLevel = accessLevels[requiredAccess];

      if (userLevel < requiredLevel) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.folder = folder;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

module.exports = { checkFolderAccess };
