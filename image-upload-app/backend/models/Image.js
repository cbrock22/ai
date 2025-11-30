const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    unique: true
  },
  originalName: {
    type: String,
    required: true
  },

  // ORIGINAL: WebP Lossless (full resolution) - for download
  originalUrl: {
    type: String,
    required: true
  },
  originalSize: {
    type: Number,
    required: true
  },
  originalWidth: {
    type: Number
  },
  originalHeight: {
    type: Number
  },

  // DISPLAY: For backward compatibility (now same as original - raw image)
  displayUrl: {
    type: String,
    required: false  // Optional - defaults to originalUrl for raw images
  },
  displaySize: {
    type: Number,
    required: false  // Optional - defaults to originalSize for raw images
  },

  // THUMBNAIL: WebP (300x300 max) - for gallery grid
  thumbnailUrl: {
    type: String
  },
  thumbnailSize: {
    type: Number
  },
  thumbnailWidth: {
    type: Number
  },
  thumbnailHeight: {
    type: Number
  },
  thumbnailGeneratedAt: {
    type: Date
  },

  // Metadata
  folder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  favoritedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Processing status
  processingStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },

  // DEPRECATED: Remove these in future migration
  url: {
    type: String
  },
  originalFilename: {
    type: String
  },
  size: {
    type: Number
  }
});

module.exports = mongoose.model('Image', imageSchema);
