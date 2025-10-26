# Image Upload App

A full-stack React application for uploading and viewing images with mobile access support. Built with React Router, Express, and persistent file storage.

## Features

- Upload large images up to 100MB via drag-and-drop or file browser
- Automatic image compression and optimization using Sharp
- View all uploaded images in a responsive gallery
- Delete images
- Persistent storage on disk
- Vibrant, soft gradient design with smooth animations
- Fully optimized for iOS devices and PWA support
- Mobile-friendly touch interface
- **Public proxy support** - Access from anywhere using LocalTunnel
- Lightweight and optimized for performance
- Image caching for faster loading
- Access from iPhone or any device on your local network

## Tech Stack

**Frontend:**
- React 18
- React Router DOM 6
- CSS3 with responsive design

**Backend:**
- Node.js
- Express
- Multer (file uploads)
- Sharp (image compression and optimization)
- CORS enabled

## 🚀 Quick Start

**New here? See the comprehensive guide:** [EASY-START-GUIDE.md](EASY-START-GUIDE.md)

### Option 1: Local Network (Easiest)
```bash
start-local.bat
```
Access from iPhone on same WiFi: `http://YOUR_IP:3000`

### Option 2: Public Access (From Anywhere)
```bash
start-with-tunnel.bat     # Start app with public LocalTunnel URL
```
Get a URL like: `https://abc-123.loca.lt`

**No signup required!** LocalTunnel works immediately out of the box.

**Having trouble?** See: [CHECK-FOR-ERRORS.md](CHECK-FOR-ERRORS.md)

**First time?** Run `setup.bat` first to install dependencies.

## Project Structure

```
image-upload-app/
├── backend/
│   ├── uploads/          # Uploaded images stored here
│   ├── server.js         # Express server
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Home.js
│   │   │   ├── Upload.js
│   │   │   └── Gallery.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Install Backend Dependencies**

```bash
cd backend
npm install
```

2. **Install Frontend Dependencies**

```bash
cd frontend
npm install
```

### Running the Application

You need to run both the backend and frontend servers.

**Option 1: Run in separate terminals**

Terminal 1 - Backend:
```bash
cd backend
npm start
```
The backend will start on http://localhost:3001

Terminal 2 - Frontend:
```bash
cd frontend
npm start
```
The frontend will start on http://localhost:3000

**Option 2: Run backend in development mode**

For automatic server restart on changes:
```bash
cd backend
npm run dev
```

## Public Access (Access from Anywhere)

Want to access your app from anywhere in the world, not just your local network?

### Quick Start with LocalTunnel

1. **Run the convenient startup script**:
   ```bash
   start-with-tunnel.bat
   ```

   This will:
   - Start the backend server with LocalTunnel integration
   - Start the frontend
   - Create a public HTTPS URL automatically
   - **No signup required!**

2. **Access from anywhere**:
   - Check the backend server window for your public URL
   - You'll get a URL like: `https://abc-123.loca.lt`
   - Share this URL to access from any device, anywhere in the world
   - Works perfectly on iPhone, Android, or any device with a browser

**Note:** If you see "Invalid Host header" on first visit, just refresh the page - this is normal!

For more proxy options (ngrok, Cloudflare Tunnel), see [backend/proxy-setup.md](backend/proxy-setup.md)

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

## Usage

### Uploading Images

1. Navigate to the "Upload" page
2. Either:
   - Click the upload area and select an image from your file browser
   - Drag and drop an image onto the upload area
3. Click "Upload" to save the image
4. Supported formats: PNG, JPG, GIF, WEBP (up to 100MB)
5. Images are automatically compressed and optimized for efficient storage and fast loading

### Viewing Gallery

1. Navigate to the "Gallery" page
2. View all uploaded images in a grid layout
3. Click any image to view it in full size
4. Click "Delete" to remove an image

### Mobile Usage

The app is fully responsive and works great on mobile:
- Upload images from your iPhone's camera or photo library
- View and manage your gallery on the go
- Touch-friendly interface

## API Endpoints

- `POST /api/upload` - Upload a new image
- `GET /api/images` - Get all uploaded images
- `DELETE /api/images/:filename` - Delete an image
- `GET /uploads/:filename` - Access uploaded image files

## Storage

Images are stored persistently in the `backend/uploads/` directory. They will remain there until manually deleted through the app or directly from the file system.

## Development

### Code Quality

**ESLint Auto-Fix:**
```bash
cd frontend
npm run lint:fix
```

Or use the Windows batch script:
```bash
lint-fix.bat
```

ESLint is configured to auto-fix on save in VS Code. See [frontend/LINTING.md](frontend/LINTING.md) for details.

### Making Changes

1. Frontend changes: Edit files in `frontend/src/`
2. Backend changes: Edit `backend/server.js`
3. The frontend will hot-reload automatically
4. The backend requires manual restart (or use `npm run dev` for auto-restart)
5. Lint issues are auto-fixed on save (VS Code)

## Security Notes

This app is designed for local network use. For production deployment:

- Add authentication
- Implement rate limiting
- Add file validation
- Set up HTTPS
- Configure proper CORS policies
- Add input sanitization

## License

MIT

## Support

For issues or questions, please open an issue in the repository.
