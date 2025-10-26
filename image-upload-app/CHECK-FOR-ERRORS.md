# How to Check for Tunnel Setup Errors

## TL;DR - Quick Check

Is your tunnel working?

Run `start-with-tunnel.bat` and check the **Backend Server (with LocalTunnel)** window for:

```
✅ Public URL: https://abc-123.loca.lt
```

If you see this, it's working! Use that URL to access your app from anywhere.

---

## Common Issues

### ⚠️ WARNING: "Invalid Host header"

**This is normal with LocalTunnel!**

**What you'll see:**
Browser shows "Invalid Host header" on first visit.

**Solution:**
Just **refresh the page once** and it will work perfectly!

---

### ❌ ERROR: "npm is not recognized"

**Solution:**
1. Install Node.js from https://nodejs.org/
2. Download the LTS version
3. Install with default options
4. Restart your terminal
5. Run `npm install` in the backend folder

---

### ❌ ERROR: "Cannot find module 'localtunnel'"

**Solution:**
```bash
cd backend
npm install
```

This will install localtunnel and all other dependencies.

---

### ⚠️ WARNING: "Public URL not showing"

If the backend starts but you don't see a public URL:

1. **Check if tunnel is enabled:**
   - Look for the message: `🌐 Starting localtunnel...`
   - If you don't see this, make sure you're running `start-with-tunnel.bat` (not `start-local.bat`)

2. **Check for error messages:**
   - Look for red error messages in the backend window
   - Follow the instructions shown in the error

3. **Check internet connection:**
   - LocalTunnel requires an active internet connection
   - Try accessing any website to verify connectivity

---

## What Success Looks Like

After running `start-with-tunnel.bat`, you should see TWO windows open:

### Window 1: Backend Server (with LocalTunnel)
```
🚀 Server running on:
   Local:   http://localhost:3001
   Network: http://192.168.1.100:3001

📱 Access from iPhone: http://192.168.1.100:3001

📁 Uploads directory: C:\...\backend\uploads

🌐 Starting localtunnel...

✅ Public URL: https://abc-123.loca.lt

📱 Access from anywhere: https://abc-123.loca.lt

⚠️  NOTE: If you see "Invalid Host header", this is normal.
   The tunnel is working - just refresh the page!
```

### Window 2: Frontend Server
```
Compiled successfully!

You can now view image-upload-app in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.1.100:3000
```

---

## Step-by-Step Troubleshooting

### Step 1: Check Node.js Installation
```bash
node --version
npm --version
```

If either command fails, install Node.js from https://nodejs.org/

### Step 2: Install Dependencies
```bash
cd backend
npm install
cd ../frontend
npm install
```

### Step 3: Run the App
```bash
start-with-tunnel.bat
```

**Note:** LocalTunnel requires NO configuration - it works immediately!

### Step 4: Check for Errors
- Read the backend window carefully
- Look for the ✅ Public URL message
- If you see errors, read them and follow the instructions

---

## Alternative: Local Network Only

Don't need public access? Use local network only:

```bash
start-local.bat
```

This works immediately without any tunnel setup!
- Access from your computer: `http://localhost:3000`
- Access from iPhone (same WiFi): `http://YOUR_IP:3000`

---

## Quick Decision Guide

```
Want public access?
│
├─ Yes
│  ├─ First time setup?
│  │  ├─ Yes → Sign up at ngrok.com
│  │  │       → Get authtoken
│  │  │       → Run: npx ngrok config add-authtoken TOKEN
│  │  │       → Run: start-with-tunnel.bat
│  │  │
│  │  └─ No  → Run: start-with-tunnel.bat
│  │
│  └─ Having issues?
│     → Check backend window for error messages
│     → Follow instructions shown in error
│
└─ No (local network only)
   → Run: start-local.bat
```

---

## Need More Help?

**For detailed proxy options:**
- See: [backend/proxy-setup.md](backend/proxy-setup.md)

**For general usage:**
- See: [README.md](README.md)
- See: [EASY-START-GUIDE.md](EASY-START-GUIDE.md)

**Can't get it working?**
- Use `start-local.bat` for local network access (works immediately!)
