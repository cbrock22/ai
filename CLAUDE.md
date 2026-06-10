# Image Upload App — Agent Context

## What This Is

A self-hosted image gallery app with user auth, folders, and role-based permissions. Deployed at `http://images.cole-brock.com`. Uses Docker Compose for both dev and prod. Images stored in AWS S3 (`image-storage-app-2025`, `us-east-2`).

## Stack

- **Frontend**: React 18, React Router 6, Tailwind CSS — served from `frontend/src/`
- **Backend**: Node.js 18, Express 4, JWT auth, Multer (uploads), Sharp (image processing) — `backend/server.js`
- **Database**: MongoDB 7.0 via Mongoose — models in `backend/models/`
- **Storage**: AWS S3 (prod) or local `backend/uploads/` (dev) — toggled by `USE_S3` env var
- **Infra**: Docker Compose — `docker-compose.dev.yml` (dev) / `docker-compose.prod.yml` (prod)

## File Structure

```
image-upload-app/
├── backend/
│   ├── server.js              # Express app entry — auth, S3, admin-user seeding
│   ├── models/
│   │   ├── User.js            # User schema (role: admin|user)
│   │   ├── Folder.js          # Folder schema (owner, isPublic, permissions[])
│   │   └── Image.js           # Image metadata schema
│   ├── routes/
│   │   ├── auth.js            # /api/auth/* — signup, login, logout, me, change-password
│   │   ├── folders.js         # /api/folders/* — CRUD + permissions
│   │   └── images.js          # /api/images/* — upload, list, delete
│   ├── middleware/
│   │   ├── auth.js            # verifyToken middleware
│   │   └── permissions.js     # folder access checks
│   └── .env.example           # env template (copy to .env)
├── frontend/
│   ├── src/
│   │   ├── App.js             # Routes + PrivateRoute guard
│   │   ├── context/
│   │   │   └── AuthContext.js # Global auth state (user, login, logout)
│   │   └── components/
│   │       ├── Login.js / Signup.js
│   │       ├── Gallery.js     # Image grid + lightbox
│   │       ├── Upload.js      # Drag-drop uploader
│   │       ├── Folders.js     # Folder management
│   │       └── Users.js       # Admin-only user management
│   └── public/
│       └── index.html         # iOS meta tags, PWA manifest link
├── nginx/conf.d/app.conf      # Reverse proxy + SSL termination
├── docker-compose.dev.yml     # Dev: hot-reload, mounts source
├── docker-compose.prod.yml    # Prod: built image, port 80/443
├── Dockerfile                 # Multi-stage: build frontend → serve with backend
├── .env                       # GITIGNORED — prod credentials go here
└── docs/REFERENCE.md          # GITIGNORED — operational reference
```

## Ports (Docker)

| Port | Service |
|------|---------|
| 3000 | Frontend dev server |
| 3001 | Backend API |
| 8081 | Mongo Express (creds: admin/admin123) |
| 27017 | MongoDB |

## How to Run

```bash
# Development (hot-reload, source-mounted)
npm run start:dev          # or: npm run docker:dev

# Production (built image)
npm run docker:prod

# Logs
npm run docker:logs
npm run docker:logs:backend

# Fresh start (wipe volumes)
npm run docker:dev:clean
```

## Auth & Permissions Model

- JWT stored in `localStorage` + HTTP-only cookie; 7-day expiry
- Two roles: `admin` (full access) and `user` (folder-level permissions)
- Folder permissions array: `[{ user: ObjectId, access: "read"|"write"|"admin" }]`
- Admin auto-seeded on startup from `DEFAULT_ADMIN_*` env vars (skipped if user exists)
- Route guard: `App.js` `PrivateRoute` checks `AuthContext`; 401 responses redirect to `/login`

## Image Upload Flow

1. Frontend `Upload.js` → `POST /api/images` with `FormData` (file + folderId)
2. `auth.js` middleware verifies JWT
3. `permissions.js` checks user has write access to folder
4. Multer buffers file in memory
5. Sharp: auto-rotate (EXIF), resize max 2400×2400, convert to JPEG 85%
6. If `USE_S3=true`: upload to S3, URL = `https://BUCKET.s3.REGION.amazonaws.com/FILENAME`
7. If `USE_S3=false`: write to `backend/uploads/`, served as static files
8. MongoDB record created: `{ filename, folder, uploadedBy, size, uploadDate }`

## Key API Endpoints

```
POST /api/auth/signup | login | logout
GET  /api/auth/me
POST /api/auth/change-password

GET|POST        /api/folders
GET|PUT|DELETE  /api/folders/:id
POST            /api/folders/:id/permissions
DELETE          /api/folders/:id/permissions/:userId

POST   /api/images              (multipart: file, folderId)
GET    /api/images
GET    /api/images/folder/:id
DELETE /api/images/:id
```

## Environment Variables

```env
PORT=3001
NODE_ENV=development|production
FRONTEND_URL=http://localhost:3000
MONGODB_URI=mongodb://admin:admin123@mongodb:27017/image-upload-app?authSource=admin
JWT_SECRET=<64-char hex>

USE_S3=false|true
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=image-storage-app-2025

DEFAULT_ADMIN_USERNAME=cbro
DEFAULT_ADMIN_EMAIL=cole.brock@gmail.com
DEFAULT_ADMIN_PASSWORD=...
```

Dev values hardcoded in `docker-compose.dev.yml`. Prod values in `.env` (gitignored).

## Common Tasks — Where to Make Changes

| Task | Files |
|------|-------|
| Add a new API route | `backend/routes/` + register in `backend/server.js` |
| Add a new page | `frontend/src/components/NewPage.js` + route in `frontend/src/App.js` |
| Change image processing | `backend/routes/images.js` — Sharp pipeline |
| Change auth logic | `backend/middleware/auth.js` + `backend/routes/auth.js` |
| Change folder permissions | `backend/middleware/permissions.js` + `Folder.js` model |
| Change DB schema | `backend/models/` — Mongoose schemas |
| Change frontend auth state | `frontend/src/context/AuthContext.js` |
| Change nginx/SSL config | `nginx/conf.d/app.conf` |
| Change Docker build | `Dockerfile` (prod), `backend/Dockerfile.dev` / `frontend/Dockerfile.dev` |

## Deployment

Auto-deploys via GitHub Actions on push to `main`. Workflow SSHes into AWS Lightsail, copies files, runs `docker-compose -f docker-compose.prod.yml up -d --build`. Domain: `images.cole-brock.com`.

Manual deploy:
```bash
ssh ubuntu@<lightsail-ip>
cd /home/ubuntu/image-upload-app
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

## Known Patterns & Conventions

- Frontend uses `fetch` with `credentials: 'include'` for all API calls
- Errors returned as `{ error: "message" }` JSON with appropriate HTTP status
- Admin-only routes check `req.user.role === 'admin'`
- Image filenames are `Date.now() + '-' + originalname` (collision-resistant but not UUID)
- S3 uploads use the same filename as local storage would
