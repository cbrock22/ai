const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { apiLimiter } = require('./middleware/rateLimit');
const multer = require('multer');
const sharp = require('sharp');
const { join } = require('path');
const { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } = require('fs');
const { networkInterfaces } = require('os');
// localtunnel is dev-only (lazy-required inside the ENABLE_TUNNEL block below) so
// it — and its old transitive deps — are no longer pulled into the prod image.
const https = require('https');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const PORT = process.env.PORT || 3001;
const uploadsDir = join(__dirname, 'uploads');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/image-upload-app';
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('📦 Connected to MongoDB');

    // Create default admin user if it doesn't exist
    await createDefaultAdmin();

    // Thumbnail worker disabled - thumbnails now generated synchronously on upload
    // const { startThumbnailWorker } = require('./services/thumbnailWorker');
    // startThumbnailWorker();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Function to create default admin user
async function createDefaultAdmin() {
  try {
    const User = require('./models/User');

    const adminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'ChangeThisPassword123!';

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username: adminUsername }, { email: adminEmail }]
    });

    if (existingUser) {
      // User exists - upgrade to admin and reset password
      let updated = false;

      if (existingUser.role !== 'admin') {
        existingUser.role = 'admin';
        updated = true;
      }

      // Always update password to match the admin password from env
      existingUser.password = adminPassword;
      updated = true;

      if (updated) {
        await existingUser.save();
        console.log('✅ Existing user upgraded to admin with new password');
        console.log(`   Username: ${existingUser.username}`);
        console.log(`   Email: ${existingUser.email}`);
      } else {
        console.log('👤 Admin user already exists');
        console.log(`   Username: ${existingUser.username}`);
        console.log(`   Email: ${existingUser.email}`);
      }
      return;
    }

    // Create new admin user
    const adminUser = new User({
      username: adminUsername,
      email: adminEmail,
      password: adminPassword,
      role: 'admin'
    });

    await adminUser.save();
    console.log('✅ Default admin user created successfully');
    console.log(`   Username: ${adminUsername}`);
    console.log(`   Email: ${adminEmail}`);
    console.log('   ⚠️  IMPORTANT: Change the default admin password!');
  } catch (error) {
    console.error('❌ Error creating default admin user:', error.message);
  }
}

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

// Behind nginx (prod) / localtunnel — trust the first proxy hop so rate limiting
// and secure cookies see the real client IP/protocol.
app.set('trust proxy', 1);

// Security headers. CSP is disabled because the SPA loads images cross-origin
// (S3 in prod, the API host in dev) and uses inline styles; a strict default CSP
// would break those. CORP is set to cross-origin so the frontend origin can load
// images/static served by this backend in dev. The other ~13 Helmet headers
// (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, etc.) stay on.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5000',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Health probe for Docker / orchestration. Intentionally lives OUTSIDE /api so
// it is not rate-limited and requires no auth. Returns 200 only when Mongo is
// actually connected (readyState === 1); otherwise 503. This lets
// `depends_on: condition: service_healthy` hold dependents (nginx, frontend)
// until the API can really serve DB-backed requests.
const MONGO_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
app.get('/health', (req, res) => {
  const state = mongoose.connection.readyState;
  const dbConnected = state === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: MONGO_STATES[state] || 'unknown',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// General API rate limit (auth endpoints get a stricter limit of their own).
app.use('/api', apiLimiter);

// Serve images with caching headers for better performance (local storage only)
if (!USE_S3) {
  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '7d',
    etag: true,
    lastModified: true
  }));
}

// API Routes
const authRoutes = require('./routes/auth');
const folderRoutes = require('./routes/folders');
const imageRoutes = require('./routes/images');

app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/images', imageRoutes);

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = join(__dirname, '..', 'frontend', 'build');
  app.use(express.static(frontendPath));
}

// Legacy routes (kept for backwards compatibility but should use new /api/images routes)
// Multer configuration - memory storage for compression
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => cb(file.mimetype.startsWith('image/') ? null : new Error('Images only'), file.mimetype.startsWith('image/')),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Helper: Generate unique filename
const generateFilename = () => `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;

/*
// DEPRECATED: Use /api/images instead
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
*/

// Handle React routing - catch-all route (must be after API routes)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const frontendPath = join(__dirname, '..', 'frontend', 'build');
    res.sendFile(join(frontendPath, 'index.html'));
  });
}

// Global error handler — must be registered LAST. Responds with JSON (not the
// default HTML error page), maps Multer upload errors to proper status codes,
// and never leaks internal error messages or stack traces in production.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ error: 'Upload error' });
  }

  console.error('[error]', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error' : err.message || 'Internal server error',
  });
});

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

const server = app.listen(PORT, '0.0.0.0', async () => {
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

        // Lazy-load: only needed when tunnelling locally, never in production.
        const localtunnel = require('localtunnel');

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

// Increase timeout for image processing (5 minutes)
server.timeout = 300000;
