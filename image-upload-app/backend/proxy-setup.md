# Public Proxy Setup Guide

Access your image upload app from anywhere in the world using a public proxy.

## Option 1: LocalTunnel (Recommended - No Signup Required)

### Setup

1. **Run the app with tunnel**
   ```bash
   start-with-tunnel.bat
   ```

   The LocalTunnel will start automatically when the backend starts!

   You'll get a public URL like: `https://abc-123.loca.lt`

### Features
- **No signup required!** Works immediately out of the box
- Integrated into the backend server (no separate process needed)
- Free with no connection limits
- HTTPS included automatically
- Node.js module-based (no external CLI installation)

**Note:** If you see "Invalid Host header" on first visit, just refresh the page - this is normal!

## Option 2: ngrok (Alternative - Requires Signup)

### Setup

1. **Sign up and configure**
   - Visit https://ngrok.com and create a free account
   - Get your authtoken from dashboard
   - Configure once:
   ```bash
   npx ngrok config add-authtoken YOUR-TOKEN
   ```

2. **Run the tunnel**
   ```bash
   # Start your app first (start-local.bat)
   # Then run:
   npx ngrok http 3000
   ```

   You'll get a public URL like: `https://abc-123.ngrok-free.app`

### Features
- Fast and reliable
- Free tier: 40 connections/min
- Custom domains available on paid plans
- HTTPS included automatically
- May trigger Windows Defender (false positive)

## Option 3: Cloudflare Tunnel (Alternative - Unlimited Bandwidth)

### Setup

1. **Install Cloudflare Tunnel**
   ```bash
   # Windows (PowerShell as Administrator)
   winget install --id Cloudflare.cloudflared

   # Mac
   brew install cloudflare/cloudflare/cloudflared

   # Linux
   wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared-linux-amd64.deb
   ```

2. **Run the tunnel**
   ```bash
   # Start your app first (start-local.bat)
   # Then run:
   cloudflared tunnel --url http://localhost:3000
   ```

   You'll get a public URL like: `https://random-words-123.trycloudflare.com`

### Features
- No signup required
- Unlimited bandwidth
- HTTPS included automatically
- Separate CLI tool (not Node.js integrated)

## Option 4: Serveo (No Installation Required)

```bash
# Run after starting your app
ssh -R 80:localhost:3000 serveo.net
```

You'll get a public URL instantly. No sign-up required.

## Important Notes

### Security Considerations
⚠️ **Your app will be publicly accessible!**

- No authentication is currently implemented
- Anyone with the URL can upload/delete images
- Consider adding password protection for production use

### Recommendation for iOS Access
Use **LocalTunnel** for the easiest integrated experience:
- Built into the backend server
- No signup required - works immediately
- No separate CLI tool needed
- HTTPS URLs included
- Reliable on cellular networks
- Easy setup with npm

### Backend Configuration
The backend is already configured to accept connections from any origin (CORS enabled).

### Firewall Note
Windows may prompt you to allow Node.js through the firewall. Click "Allow" for both private and public networks.
