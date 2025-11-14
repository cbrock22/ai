const sharp = require('sharp');
const Image = require('../models/Image');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const os = require('os');

const USE_S3 = process.env.USE_S3 === 'true';
const s3Client = USE_S3 ? new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}) : null;
const S3_BUCKET = process.env.S3_BUCKET_NAME;

// CPU usage monitoring
function getCPUUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);
  return usage;
}

// Download image from S3
async function downloadFromS3(key) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key
  });

  const response = await s3Client.send(command);
  const chunks = [];

  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

// Upload thumbnail to S3
async function uploadThumbnailToS3(buffer, filename) {
  const thumbnailFilename = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '-thumb.webp');

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: S3_BUCKET,
      Key: thumbnailFilename,
      Body: buffer,
      ContentType: 'image/webp',
      CacheControl: 'max-age=604800'
    }
  });

  await upload.done();

  const url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${thumbnailFilename}`;
  return url;
}

// Main thumbnail worker function
async function thumbnailWorker() {
  console.log('[ThumbnailWorker] Started - will generate thumbnails during low server load');

  while (true) {
    try {
      // Check CPU usage - only run if server is not busy
      const cpuUsage = getCPUUsage();
      if (cpuUsage > 50) {
        console.log(`[ThumbnailWorker] CPU usage at ${cpuUsage}%, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 min
        continue;
      }

      // Find one image that needs a thumbnail
      const image = await Image.findOne({
        thumbnailUrl: null,
        processingStatus: { $ne: 'failed' }
      }).sort({ uploadDate: 1 }); // FIFO - oldest first

      if (!image) {
        // No work to do, wait 30 seconds
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }

      console.log(`[ThumbnailWorker] Processing ${image.filename}...`);

      // Download image from S3 or local
      let imageBuffer;
      if (USE_S3) {
        const key = image.filename;
        imageBuffer = await downloadFromS3(key);
      } else {
        // For local storage
        const fs = require('fs').promises;
        const { join } = require('path');
        const uploadsDir = join(__dirname, '..', 'uploads');
        imageBuffer = await fs.readFile(join(uploadsDir, image.filename));
      }

      // Generate thumbnail (300x300 WebP)
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(300, 300, { fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer();

      // Upload thumbnail
      let thumbnailUrl;
      if (USE_S3) {
        thumbnailUrl = await uploadThumbnailToS3(thumbnailBuffer, image.filename);
      } else {
        // Save locally
        const fs = require('fs').promises;
        const { join } = require('path');
        const uploadsDir = join(__dirname, '..', 'uploads');
        const thumbnailFilename = image.filename.replace(/\.(jpg|jpeg|png|gif)$/i, '-thumb.webp');
        await fs.writeFile(join(uploadsDir, thumbnailFilename), thumbnailBuffer);
        const protocol = 'http';
        const host = `localhost:${process.env.PORT || 3001}`;
        thumbnailUrl = `${protocol}://${host}/uploads/${thumbnailFilename}`;
      }

      // Update database
      image.thumbnailUrl = thumbnailUrl;
      image.thumbnailSize = thumbnailBuffer.length;
      image.thumbnailGeneratedAt = new Date();
      image.processingStatus = 'completed';
      await image.save();

      console.log(`[ThumbnailWorker] Completed ${image.filename} - ${(thumbnailBuffer.length / 1024).toFixed(2)}KB`);

    } catch (error) {
      console.error('[ThumbnailWorker] Error:', error);

      // Mark image as failed if we have an image reference
      try {
        const image = await Image.findOne({
          thumbnailUrl: null,
          processingStatus: 'pending'
        }).sort({ uploadDate: 1 });

        if (image) {
          image.processingStatus = 'failed';
          await image.save();
        }
      } catch (updateError) {
        console.error('[ThumbnailWorker] Failed to mark image as failed:', updateError);
      }

      // Error cooldown
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

// Start the worker
function startThumbnailWorker() {
  console.log('[ThumbnailWorker] Starting background thumbnail generation...');
  thumbnailWorker().catch(error => {
    console.error('[ThumbnailWorker] Fatal error:', error);
    // Restart after 30 seconds
    setTimeout(startThumbnailWorker, 30000);
  });
}

module.exports = { startThumbnailWorker };
