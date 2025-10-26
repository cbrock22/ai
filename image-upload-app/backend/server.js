const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { join } = require('path');
const { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } = require('fs');
const { networkInterfaces } = require('os');
const localtunnel = require('localtunnel');
const https = require('https');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const PORT = process.env.PORT || 3001;
const uploadsDir = join(__dirname, 'uploads');

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

// Initialize uploads directory (for local storage)
if (!USE_S3 && !existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true});

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve images with caching headers for better performance (local storage only)
if (!USE_S3) {
  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '7d',
    etag: true,
    lastModified: true
  }));
}

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = join(__dirname, '..', 'frontend', 'build');
  app.use(express.static(frontendPath));
}

// Multer configuration - memory storage for compression
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => cb(file.mimetype.startsWith('image/') ? null : new Error('Images only'), file.mimetype.startsWith('image/')),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Helper: Generate unique filename
const generateFilename = () => `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;

// API: Upload and compress image
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const filename = generateFilename();
    const compressedBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true, mozjpeg: true })
      .toBuffer();

    if (USE_S3) {
      // Upload to S3
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: S3_BUCKET,
          Key: filename,
          Body: compressedBuffer,
          ContentType: 'image/jpeg',
          CacheControl: 'max-age=604800' // 7 days
        }
      });

      await upload.done();
      const url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filename}`;
      res.json({ message: 'Uploaded successfully', filename, url });
    } else {
      // Save locally
      const fs = require('fs').promises;
      await fs.writeFile(join(uploadsDir, filename), compressedBuffer);
      res.json({ message: 'Uploaded successfully', filename, url: `/uploads/${filename}` });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get all images
app.get('/api/images', async (req, res) => {
  try {
    if (USE_S3) {
      // List from S3
      const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET
      });
      const response = await s3Client.send(command);

      const images = (response.Contents || []).map(item => ({
        filename: item.Key,
        url: `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${item.Key}`,
        uploadDate: item.LastModified
      }))
      .sort((a, b) => b.uploadDate - a.uploadDate);

      res.json(images);
    } else {
      // List from local storage
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const images = readdirSync(uploadsDir)
        .filter(file => imageExts.includes(file.slice(file.lastIndexOf('.')).toLowerCase()))
        .map(file => {
          const filePath = join(uploadsDir, file);
          return {
            filename: file,
            url: `/uploads/${file}`,
            uploadDate: statSync(filePath).mtime
          };
        })
        .sort((a, b) => b.uploadDate - a.uploadDate);

      res.json(images);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Delete image
app.delete('/api/images/:filename', async (req, res) => {
  try {
    if (USE_S3) {
      // Delete from S3
      const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: req.params.filename
      });
      await s3Client.send(command);
      res.json({ message: 'Deleted successfully' });
    } else {
      // Delete from local storage
      const filePath = join(uploadsDir, req.params.filename);
      if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

      unlinkSync(filePath);
      res.json({ message: 'Deleted successfully' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle React routing - catch-all route (must be after API routes)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const frontendPath = join(__dirname, '..', 'frontend', 'build');
    res.sendFile(join(frontendPath, 'index.html'));
  });
}

// Helper: Get local IP
const getLocalIP = () => {
  const nets = networkInterfaces();
  for (const name in nets) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
};

// Helper: Get public IP
const getPublicIP = () => {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org?format=json', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.ip);
        } catch (e) {
          resolve('Unable to fetch');
        }
      });
    }).on('error', () => resolve('Unable to fetch'));
  });
};

app.listen(PORT, '0.0.0.0', async () => {
  const localIP = getLocalIP();
  console.log(`\n🚀 Server running on:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${localIP}:${PORT}`);
  console.log(`\n📱 Access from iPhone: http://${localIP}:${PORT}`);
  console.log(`\n💾 Storage: ${USE_S3 ? `AWS S3 (${S3_BUCKET})` : `Local (${uploadsDir})`}`);

  // Start localtunnel if enabled (tunnel the frontend on port 3000)
  if (process.env.ENABLE_TUNNEL === 'true') {
    console.log(`\n⏳ Waiting for frontend to start (port 3000)...`);
    console.log(`   This will take about 15 seconds...`);

    // Fetch and display public IP
    const publicIP = await getPublicIP();
    console.log(`\n🌍 Public IP: ${publicIP}`);

    setTimeout(async () => {
      try {
        console.log(`\n🌐 Starting localtunnel for frontend (port 3000)...`);

        // Generate a random subdomain to avoid conflicts
        const subdomain = `img-${Math.random().toString(36).substring(2, 8)}`;
        const tunnel = await localtunnel({ port: 3000, subdomain });

        console.log(`\n✅ Public URL: ${tunnel.url}`);
        console.log(`\n📱 Access from anywhere: ${tunnel.url}`);
        console.log(`\n⚠️  IMPORTANT: On first visit, you'll see a LocalTunnel landing page.`);
        console.log(`   Click "Click to Continue" button to access your app.`);
        console.log(`   After that, the URL will work directly!\n`);

        tunnel.on('close', () => {
          console.log('\n🔴 Localtunnel closed');
        });
      } catch (error) {
        console.error(`\n❌ Failed to start localtunnel:`, error.message);
        console.log(`\n💡 Localtunnel requires no signup - it should work immediately.`);
        console.log(`   If issues persist, check your internet connection.\n`);
      }
    }, 15000); // Wait 15 seconds for frontend to start
  } else {
    console.log();
  }
});
