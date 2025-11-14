# 🐳 Docker + MongoDB Setup

**No need to install MongoDB locally!** Everything runs in Docker containers that you can easily share and deploy.

## 🎯 Quick Start

```bash
# Install dependencies (first time only)
npm run install:all

# Start everything with Docker
npm run start:dev
```

That's it! Your app is running at http://localhost:3000

## ✨ What You Get

### 🚀 **Zero Configuration**
- MongoDB automatically starts in Docker
- No need to install MongoDB on your machine
- Works the same on Windows, Mac, and Linux

### 🔄 **Hot Reloading**
- Backend and frontend auto-reload on code changes
- MongoDB data persists across restarts
- Fast development workflow

### 📦 **Easy Sharing**
- Export Docker images to share with team
- No "works on my machine" problems
- Consistent environment for everyone

### 🛡️ **Isolated & Clean**
- No port conflicts with other projects
- Easy to start fresh (clean slate in seconds)
- No MongoDB installation cluttering your system

## 📚 Documentation

| Guide | Purpose |
|-------|---------|
| [**Quick Start**](./DOCKER_QUICK_START.md) | Get running in 3 minutes |
| [**Full Docker Guide**](./DOCKER_SETUP.md) | Complete documentation |
| [**Authentication**](./AUTHENTICATION_SETUP.md) | User management setup |
| [**Deployment**](./DEPLOYMENT.md) | Production deployment |

## 🎮 Essential Commands

### Start/Stop

```bash
# Development (with hot-reload)
npm run start:dev              # Start everything
Ctrl+C                         # Stop

# Production
npm run start:prod             # Start in background
npm run docker:prod:down       # Stop
```

### Database

```bash
npm run db:backup              # Backup database
npm run db:restore <file>      # Restore from backup
```

### Monitoring

```bash
npm run docker:logs            # View all logs
npm run docker:ps              # See what's running
```

### Cleanup

```bash
npm run docker:dev:clean       # Fresh start (deletes data)
npm run docker:clean           # Interactive cleanup menu
```

## 🌐 Access Points

Once started, access these URLs:

| Service | URL | Purpose |
|---------|-----|---------|
| App | http://localhost:3000 | Your application |
| API | http://localhost:3001 | REST API |
| Mongo Express | http://localhost:8081 | Database admin UI |

**Mongo Express Credentials:** admin / admin123

## 🔧 How It Works

### Docker Compose Services

```yaml
mongodb        # Database (port 27017)
mongo-express  # Database admin UI (port 8081)
backend        # API server (port 3001)
frontend       # React app (port 3000, dev only)
```

### Data Persistence

Your data is safe in Docker volumes:
- `mongodb_data` - All database records
- `uploads_data` - All uploaded images

Even if you stop containers, data persists. To start fresh:
```bash
npm run docker:dev:clean
```

## 🚢 Sharing Your App

### Export Docker Image

```bash
# Build and save image
docker-compose build
docker save image-upload-app > image-upload-app.tar

# On another machine
docker load < image-upload-app.tar
npm run docker:prod
```

### Share via Registry (Docker Hub)

```bash
# Tag and push
docker tag image-upload-app:latest username/image-upload-app:latest
docker push username/image-upload-app:latest

# On another machine
docker pull username/image-upload-app:latest
npm run docker:prod
```

## 🐛 Troubleshooting

### Docker Not Running?

```bash
npm run docker:check
```

This script will:
- Check if Docker is installed
- Check if Docker daemon is running
- Try to start Docker Desktop automatically
- Give helpful error messages

### Port Conflicts?

If ports 3000, 3001, 8081, or 27017 are in use:

**Windows:**
```bash
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

**Mac/Linux:**
```bash
lsof -ti:3001 | xargs kill
```

### Fresh Start Needed?

```bash
# Stop everything and delete all data
npm run docker:dev:clean

# Start fresh
npm run start:dev
```

### Container Won't Start?

```bash
# Check what's wrong
npm run docker:logs

# View specific service
docker-compose logs backend
docker-compose logs mongodb
```

## 💡 Pro Tips

### 1. Keep Docker Desktop Running
- Faster startup times
- Auto-start on login recommended

### 2. Database Admin
- Use Mongo Express at http://localhost:8081
- Browse collections, run queries, export data
- No command line needed!

### 3. Backup Before Major Changes
```bash
npm run db:backup
# Make changes...
# If something breaks:
npm run db:restore ./backups/mongodb_backup_*.gz
```

### 4. Development Workflow
```bash
# Terminal 1: Start services
npm run start:dev

# Terminal 2: View logs
npm run docker:logs

# Edit code -> Auto-reloads! 🎉
```

## 🎓 Learning More

### New to Docker?

Docker containers are like lightweight virtual machines:
- **Image**: Blueprint for a container (like a recipe)
- **Container**: Running instance (like a cooked meal)
- **Volume**: Persistent storage (survives container restarts)
- **Compose**: Tool to run multiple containers together

### Understanding docker-compose.yml

```yaml
version: '3.8'
services:
  mongodb:           # Service name
    image: mongo:7.0 # Docker image to use
    ports:
      - "27017:27017"  # host:container port mapping
    volumes:
      - mongodb_data:/data/db  # Persist data
```

### Why Docker?

✅ **Consistency**: Same environment everywhere
✅ **Isolation**: No conflicts with other projects
✅ **Portability**: Easy to share and deploy
✅ **Reproducibility**: Guaranteed to work

## 🔐 Security Note

**Development Credentials:**
- MongoDB: admin/admin123
- Mongo Express: admin/admin123

**⚠️ These are for local development only!**

For production deployment:
1. Change all default passwords
2. Use Docker secrets
3. Enable SSL/TLS
4. Set up firewall rules
5. Remove or secure Mongo Express

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production guide.

## 🚀 What's Next?

1. ✅ Start services: `npm run start:dev`
2. ✅ Create account at http://localhost:3000/signup
3. ✅ Create a folder
4. ✅ Upload images
5. ✅ Explore Mongo Express at http://localhost:8081

## 📖 Full Documentation

For complete details, see:
- [Complete Docker Guide](./DOCKER_SETUP.md) - Everything about Docker
- [Authentication Setup](./AUTHENTICATION_SETUP.md) - User system details
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment

## 🆘 Need Help?

1. Check logs: `npm run docker:logs`
2. Read full guide: [DOCKER_SETUP.md](./DOCKER_SETUP.md)
3. Try fresh start: `npm run docker:dev:clean && npm run start:dev`
4. Create issue on GitHub with logs

---

**Happy Coding! 🎉**

*Made with ❤️ using Docker, Node.js, React, and MongoDB*
