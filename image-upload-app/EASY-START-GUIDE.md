# Easy Start Guide - Image Upload App

Choose your preferred way to run the app:

## 🚀 Quick Start Options

### Option 1: Local Network Only (Easiest)

**Best for:** Same WiFi network access (iPhone on same WiFi)

**Run:**
```bash
start-local.bat
```

**Access:**
- Your computer: `http://localhost:3000`
- iPhone (same WiFi): `http://YOUR_IP:3000`
  - The backend will display your IP address

**No installation required!**

---

### Option 2: Public Internet Access (Anywhere)

**Best for:** Access from anywhere in the world, any network

**Setup:** None needed!

**Run:**
```bash
start-with-tunnel.bat
```

**Access:**
- Check the backend server window for your public URL
- Get a URL like: `https://abc-123.loca.lt`
- Share this URL to access from anywhere
- **No signup required!**

---

## 📋 Detailed Instructions

### Local Network Setup

1. **Double-click:** `start-local.bat`
2. **Wait** for both servers to start (two windows will open)
3. **Check backend window** for your network IP address:
   ```
   Network: http://192.168.1.100:3001
   📱 Access from iPhone: http://192.168.1.100:3001
   ```
4. **On iPhone:** Open Safari, go to `http://YOUR_IP:3000`

**Requirements:**
- ✅ Both devices on same WiFi
- ✅ Node.js installed
- ✅ Dependencies installed (`npm install`)

---

### Public Access Setup

#### Step 1: Run the App

```bash
start-with-tunnel.bat
```

This will start both the backend and frontend servers with LocalTunnel enabled.

**No signup needed!** LocalTunnel works immediately.

#### Step 2: Get Your Public URL

Check the "Backend Server (with LocalTunnel)" window. You'll see:
```
✅ Public URL: https://abc-123.loca.lt

📱 Access from anywhere: https://abc-123.loca.lt
```

**Share this URL** to access from anywhere!

**Note:** If you see "Invalid Host header" on first visit, just refresh the page.

---

## 🔧 Troubleshooting

### "Invalid Host header" Error

**This is normal with LocalTunnel!**

**Solution:** Just refresh the page once and it will work.

**Alternative:** Use local network only
```bash
start-local.bat
```

---

### "npm is not recognized"

**Install Node.js:**
1. Visit: https://nodejs.org/
2. Download LTS version
3. Install with default options
4. Restart terminal
5. Run: `npm install` in both backend and frontend folders

---

### "Cannot GET /"

**The frontend hasn't started yet.** Wait 15-30 seconds, then refresh.

---

### iPhone Can't Connect (Local Network)

1. **Check WiFi:** Both devices on same network?
2. **Check IP:** Use the IP shown in backend terminal
3. **Check Port:** Use `:3000` not `:3001`
4. **Firewall:** Allow Node.js through Windows Firewall
5. **Try:** Disable Windows Firewall temporarily to test

---

### Public URL Not Working

1. **Wait:** Can take 30-60 seconds to become active
2. **Servers running?** Check backend and frontend windows
3. **Copy full URL:** Include `https://`
4. **Try again:** Sometimes takes 2-3 tries to connect initially

---

## 🌐 Alternative Public Access Options

### Option A: ngrok (Requires signup)

**Setup:**
```bash
# 1. Sign up at https://ngrok.com (free)
# 2. Get authtoken from dashboard
# 3. Configure:
npx ngrok config add-authtoken YOUR-TOKEN
```

**Use:**
```bash
# Start your app first (start-local.bat)
npx ngrok http 3000
```

**Limits:** 40 connections/min (free tier)

---

### Option B: Cloudflare Tunnel (No signup)

**Setup:**
```bash
# Windows
winget install --id Cloudflare.cloudflared

# Mac
brew install cloudflare/cloudflare/cloudflared
```

**Use:**
```bash
# Start your app first (start-local.bat)
cloudflared tunnel --url http://localhost:3000
```

**Limits:** None (unlimited bandwidth)

---

### Option C: Serveo (No installation)

**Use:**
```bash
# Start your app first (start-local.bat)
ssh -R 80:localhost:3000 serveo.net
```

**Limits:** Can be unstable, requires SSH

---

## 📊 Comparison

| Method | Setup | Speed | Reliability | Free | Limit |
|--------|-------|-------|-------------|------|-------|
| **Local Network** | None | ⚡⚡⚡ | ⭐⭐⭐ | ✅ | Same WiFi |
| **LocalTunnel** | None | ⚡⚡ | ⭐⭐ | ✅ | None |
| **ngrok** | Signup | ⚡⚡⚡ | ⭐⭐⭐ | ✅ | 40 req/min |
| **Cloudflare** | Install | ⚡⚡⚡ | ⭐⭐⭐ | ✅ | None |
| **Serveo** | None | ⚡ | ⭐ | ✅ | Unstable |

---

## 🎯 Recommended Setup

**For beginners:**
```bash
start-local.bat
```

**For public access:**
```bash
start-with-tunnel.bat
# No setup needed - works immediately!
```

**For development:**
```bash
# Terminal 1
cd backend
npm start

# Terminal 2
cd frontend
npm start
```

---

## 📱 iOS/iPhone Tips

### Add to Home Screen (PWA)

1. Open the app in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. The app will work like a native app!

### Clear Cache (If issues)

1. Settings > Safari
2. Clear History and Website Data
3. Reopen the app

### Enable JavaScript

1. Settings > Safari
2. Advanced
3. Enable JavaScript

---

## ⚙️ Advanced: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

**Enable Tunnel (optional):**
Set `ENABLE_TUNNEL=true` when starting the backend to enable ngrok.

---

## 📚 Additional Resources

- **Full Setup:** See [README.md](README.md)
- **Proxy Options:** See [backend/proxy-setup.md](backend/proxy-setup.md)
- **Development:** See [UPDATES.md](UPDATES.md)
- **Linting:** See [frontend/LINTING.md](frontend/LINTING.md)

---

## 🆘 Still Having Issues?

1. Make sure Node.js is installed: `node --version`
2. Install dependencies:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
3. Check firewall settings (Windows Defender)
4. Try the local network option first
5. Restart your computer and try again

---

## ✅ Quick Checklist

Before running the app:

- [ ] Node.js installed
- [ ] Dependencies installed (`npm install` in both folders)
- [ ] iPhone on same WiFi (for local access)
- [ ] Firewall allows Node.js
- [ ] Ports 3000 and 3001 not in use

**Note:** LocalTunnel requires NO configuration for public access!

Ready to go? Run `start-local.bat` or `start-with-tunnel.bat`!
