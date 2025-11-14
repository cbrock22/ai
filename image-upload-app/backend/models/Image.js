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

  // DISPLAY: WebP Lossless (2400x2400 max) - for lightbox viewing
  displayUrl: {
    type: String,
    required: true
  },
  displaySize: {
    type: Number,
    required: true
  },

  // THUMBNAIL: WebP Lossy (300x300) - for gallery grid (generated async)
  thumbnailUrl: {
    type: String
  },
  thumbnailSize: {
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
