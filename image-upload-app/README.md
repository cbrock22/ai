# Image Upload App 📸

A secure, full-stack image upload application with user authentication, folder-based permissions, and Docker deployment. Built with React, Express, MongoDB, and Docker.

## ✨ Features

### Core Features
- 🔐 **User Authentication** - Secure JWT-based login/signup system
- 📁 **Folder Organization** - Create and organize images in public/private folders
- 🔒 **Permission System** - Control folder access with read/write/admin levels
- 🎨 **Image Processing** - Automatic compression and optimization using Sharp
- 📱 **Responsive Design** - Works perfectly on desktop and mobile devices
- 🌐 **Public Access** - Optional LocalTunnel support for external access

### Technical Features
- 🐳 **Docker Ready** - Fully containerized with MongoDB included
- 💾 **Database Persistence** - MongoDB for users, folders, and images
- 🚀 **Easy Deployment** - One-command deploy to AWS Lightsail ($10/month)
- 🔄 **Automatic Backups** - Built-in database backup and restore tools
- 🛡️ **Security** - Role-based access, bcrypt passwords, JWT tokens
- ⚡ **Hot Reload** - Development environment with instant updates

## Tech Stack

**Frontend:**
- React 18
- React Router 6
- Tailwind CSS 3
- Context API (Auth)

**Backend:**
- Node.js 18
- Express 4
- Mongoose (MongoDB ODM)
- JWT Authentication
- Multer (file uploads)
- Sharp (image processing)

**Database:**
- MongoDB 7.0 (Docker)

**Infrastructure:**
- Docker & Docker Compose
- Optional: AWS S3

## 🚀 Quick Start

### Local Development (Windows)

The simplest way to get started:

```cmd
# Open Command Prompt or PowerShell
cd path\to\image-upload-app

# Start everything (includes MongoDB in Docker)
start.bat
```

**Access:** http://localhost:5000

**Ports Used:**
- Frontend: http://localhost:5000
- Backend API: http://localhost:5001
- Mongo Express (DB Admin): http://localhost:8081

**That's it!** MongoDB, backend, and frontend are all running in Docker containers.

### Alternative: Using npm Scripts

```bash
npm run start:dev
```

**First time?** Docker will download images automatically (~5 minutes).

### macOS/Linux

```bash
./scripts/start-dev.sh
```

## 📚 Documentation

| Guide | When to Use |
|-------|-------------|
| [**Quick Start**](./DOCKER_QUICK_START.md) | Get running in 3 minutes |
| [**Windows Setup**](./WINDOWS_SETUP.md) | Windows-specific help |
| [**Docker Guide**](./DOCKER_SETUP.md) | Complete Docker docs |
| [**Authentication**](./AUTHENTICATION_SETUP.md) | User & permission setup |
| [**Deploy Quick**](./DEPLOY_QUICK.md) | Deploy in 15 minutes |
| [**Architecture**](./ARCHITECTURE.md) | System design |

## 📦 What's Included

When you run `start.bat`, you get:

- **MongoDB** - Database running in Docker (port 27017)
- **Mongo Express** - Web UI for MongoDB (port 8081)
- **Backend** - API server with hot-reload (port 3001)
- **Frontend** - React app with hot-reload (port 3000)

**Access Points:**
- App: http://localhost:3000
- API: http://localhost:3001
- Database Admin: http://localhost:8081 (login: admin/admin123)

## Project Structure

```
image-upload-app/
├── backend/
│   ├── models/           # MongoDB schemas (User, Folder, Image)
│   ├── routes/           # API routes (auth, folders, images)
│   ├── middleware/       # Auth & permissions
│   ├── uploads/          # Local image storage
│   └── server.js
├── frontend/
│   └── src/
│       ├── components/   # React components
│       ├── context/      # Auth context
│       └── App.js
├── scripts/              # Helper scripts
│   ├── deploy.sh        # Production deployment
│   ├── backup-prod.sh   # Database backup
│   └── ...
├── docker-compose.yml           # Production
├── docker-compose.dev.yml       # Development
├── docker-compose.prod.yml      # Production (Lightsail)
└── start.bat                    # Quick start (Windows)
```

## 💻 Requirements

**For Local Development:**
- Docker Desktop (includes Docker & Docker Compose)
- That's it! No need to install Node.js or MongoDB

**Download Docker Desktop:**
- Windows/Mac: https://www.docker.com/products/docker-desktop/
- Linux: https://docs.docker.com/engine/install/

## 🎯 First Time Setup

1. **Install Docker Desktop**
   - Download and install from link above
   - Start Docker Desktop
   - Wait for whale icon in system tray

2. **Clone/Download Project**
   ```bash
   git clone https://github.com/yourusername/image-upload-app.git
   cd image-upload-app
   ```

3. **Start Everything**
   ```bash
   start.bat     # Windows
   # or
   ./scripts/start-dev.sh  # macOS/Linux
   ```

4. **Create Account**
   - Go to http://localhost:3000/signup
   - Create your account

5. **Make Yourself Admin** (optional)
   - Open http://localhost:8081 (Mongo Express)
   - Login: admin/admin123
   - Navigate to: `image-upload-app` → `users`
   - Find your user, change `role` from `"user"` to `"admin"`
   - Save

Done! Start uploading images! 🎉

## 🚀 Deploy to Production

### Option 1: AWS Lightsail with Docker (Recommended)

Deploy everything (including MongoDB) to a $10/month server in ~15 minutes:

```bash
# On Lightsail server (after installing Docker)
git clone https://github.com/yourusername/image-upload-app.git
cd image-upload-app

# Configure
cp .env.production.example .env
nano .env  # Add your passwords and settings

# Deploy!
./scripts/deploy.sh
```

**Cost:** $10/month (includes MongoDB, no separate database needed!)

See the [Quick Deploy Guide](./DEPLOY_QUICK.md) for complete instructions.

### Option 2: Any Docker-Compatible Host

Works on:
- DigitalOcean Droplets
- Linode
- Vultr
- Any VPS with Docker

Same process as Lightsail - just install Docker and run the deploy script!

### Option 3: Cloud Platforms

- Heroku, Railway, Render, etc.
- May require separate MongoDB (use MongoDB Atlas)
- Check platform-specific documentation

## Accessing from iPhone (Local Network)

To access the app from your iPhone or any mobile device on the same network:

### Step 1: Find Your Computer's IP Address

When you start the backend server, it will display your local network IP address:

```
🚀 Server running on:
   Local:   http://localhost:3001
   Network: http://192.168.1.100:3001

📱 Access from iPhone: http://192.168.1.100:3001
```

**Manual Method (if needed):**

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter (usually starts with 192.168.x.x or 10.0.x.x)

**Mac/Linux:**
```bash
ifconfig
```
Look for "inet" address (usually starts with 192.168.x.x or 10.0.x.x)

### Step 2: Access from iPhone

1. Make sure your iPhone is connected to the **same Wi-Fi network** as your computer
2. Open Safari (or any browser) on your iPhone
3. Navigate to: `http://YOUR_IP_ADDRESS:3000`
   - Example: `http://192.168.1.100:3000`
4. You should see the Image Upload App!

### Troubleshooting Mobile Access

If you can't access the app from your iPhone:

1. **Check Firewall Settings:**
   - Windows: Allow Node.js through Windows Firewall
   - Mac: System Preferences > Security & Privacy > Firewall > Firewall Options > Allow incoming connections for Node

2. **Verify Same Network:**
   - Both devices must be on the same Wi-Fi network

3. **Try Different IP:**
   - If you have multiple network adapters, try the IP from your active Wi-Fi connection

4. **Restart Servers:**
   - Stop both frontend and backend servers
   - Start backend first, then frontend

## 📱 Using the App

### 1. Create Account
- Go to "Sign Up" in the menu
- Enter username, email, password
- Login with your credentials

### 2. Create Folders
- Navigate to "Folders"
- Click "New Folder"
- Choose public (anyone can view) or private (only you and permitted users)

### 3. Upload Images
1. Go to "Upload"
2. Select a folder from dropdown (only shows folders you can write to)
3. Drag and drop or click to select image
4. Click "Upload"
5. Supported formats: PNG, JPG, GIF, WEBP (up to 100MB)
6. Images auto-compressed and optimized
7. Image is saved to selected folder with your permissions

### 4. View Gallery
- Browse all images you have access to (based on folder permissions)
- Filter by folder using dropdown
- See folder name and uploader for each image
- Click image for fullscreen view with detailed info
- Delete images you uploaded or have permission to delete

### 5. Manage Permissions (Admins)
- Control who can access each folder
- Set permission levels: read, write, admin
- Make folders public or private

## 🔐 Security Features

- ✅ **JWT Authentication** - 7-day token expiration
- ✅ **Bcrypt Password Hashing** - Industry-standard encryption
- ✅ **HTTP-Only Cookies** - Secure token storage
- ✅ **Role-Based Access** - Admin and user roles
- ✅ **Folder Permissions** - Read, write, admin levels
- ✅ **Input Validation** - All inputs validated and sanitized
- ✅ **CORS Protection** - Whitelist trusted origins
- ✅ **File Type Validation** - Images only
- ✅ **File Size Limits** - Max 100MB per upload

### Production Security Checklist

- [ ] Change default MongoDB password
- [ ] Generate strong JWT secret (`openssl rand -hex 32`)
- [ ] Enable HTTPS with SSL certificate
- [ ] Remove or secure Mongo Express
- [ ] Configure firewall rules
- [ ] Set up automatic backups
- [ ] Enable rate limiting
- [ ] Configure proper CORS for your domain

## 🛠️ Development

### Making Changes

The development environment includes hot-reloading:

```bash
# Edit frontend code - auto-reloads
frontend/src/components/*.js

# Edit backend code - auto-restarts
backend/routes/*.js
backend/models/*.js
```

Just save your changes and see them instantly!

### Database Management

```bash
# Backup database
npm run db:backup

# Restore database
npm run db:restore ./backups/backup_20240101.gz

# View database in browser
# Open: http://localhost:8081
```

### View Logs

```bash
# All services
npm run docker:logs

# Specific service
docker compose logs -f backend
docker compose logs -f mongodb
```

## 💾 Data Persistence

**Local Development:**
- MongoDB data: Docker volume `mongodb_data_dev`
- Images: Docker volume `uploads_data_dev` or `backend/uploads/`
- Data persists between restarts
- Delete with: `docker-compose down -v`

**Production:**
- MongoDB data: Docker volume `mongodb_data_prod`
- Images: Docker volume `uploads_data_prod`
- Regular automated backups recommended
- Optional: Use AWS S3 for image storage

## 🎯 Quick Command Reference

```bash
# Local Development
start.bat                           # Start (Windows)
npm run start:dev                   # Start (all platforms)
npm run docker:logs                 # View logs
npm run docker:ps                   # Check status

# Database
npm run db:backup                   # Backup database
npm run db:restore <file>           # Restore backup

# Production (on server)
./scripts/deploy.sh                 # Deploy to production
npm run db:backup:prod              # Backup production DB
npm run docker:prod:logs            # View production logs
docker compose -f docker-compose.prod.yml restart  # Restart services
```

## 🐛 Troubleshooting

### Docker Issues
- **Windows:** See [WINDOWS_SETUP.md](./WINDOWS_SETUP.md)
- **General:** See [DOCKER_SETUP.md](./DOCKER_SETUP.md)

### Can't Access App?
```bash
docker ps                    # Check if containers are running
docker compose logs -f       # View logs
```

### Need Fresh Start?
```bash
# Development
docker-compose -f docker-compose.dev.yml down -v
start.bat

# Production
docker-compose -f docker-compose.prod.yml down -v
./scripts/deploy.sh
```

## 💰 Costs

**Local Development:**
- Free! Everything runs on your machine

**Production (AWS Lightsail):**
- $10/month - Includes MongoDB, no extra database cost
- First 3 months free with AWS Free Tier
- Optional: S3 storage ($0.023/GB)

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 🆘 Support

- 📖 [Documentation](./DOCKER_SETUP.md)
- 🐛 [Report Issues](https://github.com/yourusername/image-upload-app/issues)
- 💬 [Discussions](https://github.com/yourusername/image-upload-app/discussions)

---

**Made with ❤️ using Docker, React, Node.js, and MongoDB**

**Start developing:** `start.bat`

**Deploy to production:** [Quick Deploy Guide](./DEPLOY_QUICK.md) (15 minutes, $10/month)
