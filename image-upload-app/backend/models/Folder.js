const mongoose = require('mongoose');

// Folder model for organizing images with granular permissions
// Permission levels: read (view only), write (upload), admin (full control)

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  permissions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    access: {
      type: String,
      enum: ['read', 'write', 'admin'],
      default: 'read'
    }
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  displayOnPublicGallery: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    select: false  // Don't include password in queries by default
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create unique index on name and owner
folderSchema.index({ name: 1, owner: 1 }, { unique: true });

module.exports = mongoose.model('Folder', folderSchema);
