# Quick Start Guide

## Installation

Run the setup script to install all dependencies:

**Windows:**
```bash
setup.bat
```

**Mac/Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

## Running the App

### Terminal 1 - Start Backend
```bash
cd backend
npm start
```

### Terminal 2 - Start Frontend
```bash
cd frontend
npm start
```

The app will automatically open in your browser at `http://localhost:3000`

## Access from iPhone

1. When you start the backend, it will display your network IP address
2. On your iPhone, open Safari and go to: `http://YOUR_IP:3000`
   - Example: `http://192.168.1.100:3000`
3. Make sure your iPhone is on the same Wi-Fi network as your computer

## First Steps

1. Click "Upload" in the navigation
2. Drag and drop an image or click to browse
3. Click "Upload" to save
4. Go to "Gallery" to view all your images
5. Click any image to view it full size

That's it! You're ready to start uploading images.

## Troubleshooting

- If the frontend doesn't open automatically, navigate to `http://localhost:3000`
- If you can't access from iPhone, check your firewall settings
- Make sure both servers are running before using the app
