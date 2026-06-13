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

  // DISPLAY RENDITIONS: responsive AVIF/WebP/JPEG ladder for the lightbox view.
  // Frontend builds a <picture> + srcset from these; empty for legacy images
  // (which fall back to originalUrl/displayUrl).
  renditions: [{
    url: { type: String, required: true },
    format: { type: String, enum: ['avif', 'webp', 'jpeg'], required: true },
    width: { type: Number },
    height: { type: Number },
    size: { type: Number }
  }],

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

  // User-assigned tags for search/organization. Lowercased + de-duped on save.
  tags: {
    type: [String],
    default: []
  },

  // SHA-256 of the raw uploaded bytes (pre-Sharp). Used to detect and skip
  // re-uploads of an identical file within the same folder so we don't store
  // duplicate S3 objects / DB rows. Folder-scoped (see index below) rather than
  // a hard global unique constraint, so the same photo can still live in two
  // different albums intentionally.
  hash: {
    type: String
  },

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

// Full-text search index over the human-meaningful fields. Weighted so tag
// matches rank above filename matches. Enables indexed $text search (relevance
// scored, language-aware) instead of slow, unindexed $regex scans.
imageSchema.index(
  { tags: 'text', originalName: 'text' },
  { weights: { tags: 5, originalName: 1 }, name: 'image_text_search' }
);

// Hot read path: listing a folder's images newest-first. The trailing _id gives
// the keyset (cursor) pagination a stable, unique tiebreaker so the range scan
// {uploadDate,_id} < cursor walks the index directly — no skip()-and-discard.
imageSchema.index({ folder: 1, uploadDate: -1, _id: -1 });

// Folder-scoped duplicate detection on re-upload (see `hash` above).
imageSchema.index({ folder: 1, hash: 1 });

module.exports = mongoose.model('Image', imageSchema);
