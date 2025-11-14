# Architecture Overview

## Docker Container Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Host Machine                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Docker Network (app-network)            │   │
│  │                                                      │   │
│  │  ┌──────────────┐    ┌──────────────┐             │   │
│  │  │   Frontend   │    │   Backend    │             │   │
│  │  │   (React)    │───▶│  (Express)   │             │   │
│  │  │  Port 3000   │    │  Port 3001   │             │   │
│  │  └──────────────┘    └───────┬──────┘             │   │
│  │        │                      │                     │   │
│  │        │                      │                     │   │
│  │        └──────────────┬───────┘                     │   │
│  │                       │                             │   │
│  │                       ▼                             │   │
│  │              ┌─────────────────┐                   │   │
│  │              │    MongoDB      │                   │   │
│  │              │  Port 27017     │                   │   │
│  │              └────────┬────────┘                   │   │
│  │                       │                             │   │
│  │                       │                             │   │
│  │              ┌────────▼────────┐                   │   │
│  │              │ Mongo Express   │                   │   │
│  │              │  Port 8081      │                   │   │
│  │              └─────────────────┘                   │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Docker Volumes (Persistent)             │   │
│  │                                                      │   │
│  │  📦 mongodb_data      - Database files              │   │
│  │  📦 mongodb_config    - MongoDB configuration       │   │
│  │  📦 uploads_data      - Uploaded image files        │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Application Data Flow

```
User Browser
    │
    ▼
┌───────────────┐
│   React App   │  (Frontend - Port 3000)
│               │
│  - Login UI   │
│  - Upload UI  │
│  - Gallery UI │
└───────┬───────┘
        │
        │ HTTP/REST API
        │
        ▼
┌───────────────────┐
│  Express Server   │  (Backend - Port 3001)
│                   │
│  Routes:          │
│  /api/auth/*     │  - Signup, Login, Logout
│  /api/folders/*  │  - Create, List, Manage Folders
│  /api/images/*   │  - Upload, List, Delete Images
│                   │
│  Middleware:      │
│  - JWT Auth      │  - Verify tokens
│  - Permissions   │  - Check folder access
│  - Multer       │  - Handle file uploads
│  - Sharp        │  - Image processing
└─────────┬─────────┘
          │
          │ MongoDB Driver
          │
          ▼
┌─────────────────────┐
│      MongoDB        │  (Database - Port 27017)
│                     │
│  Collections:       │
│  - users           │  - User accounts & roles
│  - folders         │  - Folders & permissions
│  - images          │  - Image metadata
│                     │
└─────────────────────┘
```

## Authentication Flow

```
1. User Signup/Login
   │
   ▼
2. Backend validates credentials
   │
   ▼
3. Generate JWT token (expires in 7 days)
   │
   ▼
4. Send token in HTTP-only cookie + response
   │
   ▼
5. Client stores token in localStorage
   │
   ▼
6. Subsequent requests include token
   │
   ▼
7. Auth middleware verifies token
   │
   ├─ Valid ──▶ Allow request
   │
   └─ Invalid ─▶ 401 Unauthorized
```

## Permission System

```
User
 │
 ├─ role: "admin"
 │   └─ Full access to everything
 │
 └─ role: "user"
     │
     └─ Access based on folder permissions

Folder
 │
 ├─ owner: userId
 │   └─ Full control (read, write, admin)
 │
 ├─ isPublic: true
 │   └─ Anyone can view (read only)
 │
 └─ permissions: [
       { user: userId, access: "read" }   - View images
       { user: userId, access: "write" }  - Upload/delete
       { user: userId, access: "admin" }  - Manage folder
     ]
```

## Image Upload Flow

```
1. User selects image + folder
   │
   ▼
2. Browser sends FormData to /api/images
   │
   ▼
3. Auth middleware verifies user
   │
   ▼
4. Permission middleware checks folder access
   │
   ▼
5. Multer receives image in memory
   │
   ▼
6. Sharp processes image:
   - Auto-rotate based on EXIF
   - Resize max 2400x2400
   - Convert to JPEG (85% quality)
   │
   ▼
7. Save to storage:
   - Local: ./uploads/filename.jpg
   - S3: Upload to AWS bucket
   │
   ▼
8. Create image record in MongoDB:
   {
     filename: "123456789.jpg",
     folder: folderId,
     uploadedBy: userId,
     size: 1234567,
     uploadDate: Date
   }
   │
   ▼
9. Return success + image URL
```

## Development vs Production

### Development Mode (docker-compose.dev.yml)

```
┌─────────────────────────────────────┐
│         Host Machine (You)          │
│                                     │
│  /backend  ──▶  Backend Container  │  Hot-reload
│  /frontend ──▶  Frontend Container │  Hot-reload
│                                     │
│  Your code changes auto-reload!    │
└─────────────────────────────────────┘
```

### Production Mode (docker-compose.yml)

```
┌─────────────────────────────────────┐
│        Production Container         │
│                                     │
│  Built frontend ──▶ Static files   │
│  Backend serves API + Frontend     │
│                                     │
│  Optimized & ready to deploy!      │
└─────────────────────────────────────┘
```

## Technology Stack

```
┌─────────────────────────────────────┐
│            Frontend                  │
├─────────────────────────────────────┤
│  - React 18                         │
│  - React Router 6                   │
│  - Tailwind CSS 3                   │
│  - Context API (Auth)               │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│            Backend                   │
├─────────────────────────────────────┤
│  - Node.js 18                       │
│  - Express 4                        │
│  - Mongoose (MongoDB ODM)           │
│  - JWT (jsonwebtoken)               │
│  - Bcrypt (password hashing)        │
│  - Multer (file uploads)            │
│  - Sharp (image processing)         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│           Database                   │
├─────────────────────────────────────┤
│  - MongoDB 7.0                      │
│  - Mongo Express (admin UI)         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         Infrastructure               │
├─────────────────────────────────────┤
│  - Docker & Docker Compose          │
│  - Optional: AWS S3 (image storage) │
└─────────────────────────────────────┘
```

## Security Layers

```
1. Transport Security
   └─ HTTPS (in production)

2. Authentication
   ├─ JWT tokens (7-day expiry)
   ├─ HTTP-only cookies
   └─ Bcrypt password hashing (10 rounds)

3. Authorization
   ├─ Role-based access (admin/user)
   ├─ Folder permissions (read/write/admin)
   └─ Ownership checks

4. Input Validation
   ├─ express-validator
   ├─ File type checking (images only)
   └─ File size limits (100MB max)

5. Database Security
   ├─ MongoDB authentication
   ├─ Parameterized queries (Mongoose)
   └─ No direct query injection

6. CORS Protection
   └─ Whitelist frontend URL only
```

## Scaling Considerations

### Current (Single Instance)
```
Browser → Backend → MongoDB
```

### Horizontal Scaling
```
Browser → Load Balancer
          ├─ Backend Instance 1 ─┐
          ├─ Backend Instance 2 ─┤→ MongoDB Cluster
          └─ Backend Instance 3 ─┘
```

### Recommended Production Architecture
```
         ┌─────────────────┐
         │   CloudFlare    │  CDN + DDoS Protection
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  Load Balancer  │  NGINX/ALB
         └────────┬────────┘
                  │
         ┌────────▼────────────────────┐
         │    Backend Cluster          │
         │  (Auto-scaling 2-10 nodes)  │
         └────────┬────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌─────────────┐         ┌──────────────┐
│   MongoDB   │         │   AWS S3     │
│   Replica   │         │   (Images)   │
│   Set       │         │              │
└─────────────┘         └──────────────┘
```

## File Structure

```
image-upload-app/
├── backend/
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API endpoints
│   ├── middleware/      # Auth, permissions
│   ├── uploads/         # Local image storage
│   ├── server.js        # Express app
│   └── Dockerfile.dev   # Dev container
│
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── context/     # Auth context
│   │   └── App.js       # Main app
│   └── Dockerfile.dev   # Dev container
│
├── scripts/             # Helper scripts
│   ├── check-docker.*   # Docker daemon check
│   ├── start-dev.*      # Start development
│   ├── start-prod.*     # Start production
│   ├── db-backup.sh     # Backup database
│   └── db-restore.sh    # Restore database
│
├── docker-compose.yml       # Production config
├── docker-compose.dev.yml   # Development config
├── Dockerfile               # Production build
└── .dockerignore            # Exclude files
```

## Port Mapping

| Port | Service | Environment | Purpose |
|------|---------|-------------|---------|
| 3000 | Frontend | Development | React dev server |
| 3001 | Backend | Both | Express API |
| 8081 | Mongo Express | Both | Database admin UI |
| 27017 | MongoDB | Both | Database |

## Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development|production
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://admin:admin123@mongodb:27017/...

# Security
JWT_SECRET=<random-32-byte-hex-string>

# Storage (Optional)
USE_S3=false|true
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=...
```

## API Endpoints Summary

### Authentication (`/api/auth`)
- `POST /signup` - Create account
- `POST /login` - Login
- `POST /logout` - Logout
- `GET /me` - Get current user
- `POST /change-password` - Update password

### Folders (`/api/folders`)
- `GET /` - List accessible folders
- `POST /` - Create folder
- `GET /:id` - Get folder details
- `PUT /:id` - Update folder
- `DELETE /:id` - Delete folder
- `POST /:id/permissions` - Add user access
- `DELETE /:id/permissions/:userId` - Remove access

### Images (`/api/images`)
- `POST /` - Upload image (+ folderId)
- `GET /` - List all accessible images
- `GET /folder/:id` - Get folder images
- `DELETE /:id` - Delete image

## Quick Command Reference

```bash
# Start/Stop
npm run start:dev          # Development mode
npm run docker:prod        # Production mode (detached)
npm run docker:prod:down   # Stop production

# Monitoring
npm run docker:logs        # All logs
npm run docker:ps          # Running containers

# Database
npm run db:backup          # Backup MongoDB
npm run db:restore <file>  # Restore backup

# Cleanup
npm run docker:dev:clean   # Fresh start
npm run docker:clean       # Interactive cleanup
```
