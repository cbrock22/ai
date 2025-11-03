# SSL Setup - Quick Start

## What I've Done

I've set up everything you need for free SSL certificates (HTTPS) using Let's Encrypt:

✅ Added Nginx reverse proxy for SSL termination
✅ Configured Certbot for automatic certificate management
✅ Updated docker-compose.prod.yml with SSL support
✅ Created automated setup script
✅ Configured auto-renewal every 12 hours

## What You Need to Do

### Before Setup

1. **Make sure your domain's DNS is pointing to your Lightsail server**
   - Your domain should have an A record pointing to: `18.117.203.205` (or current IP)
   - Both `yourdomain.com` and `www.yourdomain.com` should point to the server
   - Wait for DNS to propagate (check with: `nslookup yourdomain.com`)

### Setup Steps (After Deploying Code)

1. **SSH into your Lightsail server:**
   ```bash
   ssh -i your-key.pem ubuntu@18.117.203.205
   ```

2. **Navigate to the app directory:**
   ```bash
   cd image-upload-app
   ```

3. **Run the SSL setup script:**
   ```bash
   sudo ./setup-ssl.sh
   ```

4. **Enter your information when prompted:**
   - Your domain name (e.g., `example.com`)
   - Your email address (for Let's Encrypt notifications)

5. **Wait for the script to complete** (usually 1-2 minutes)

6. **Visit your site:**
   ```
   https://yourdomain.com
   ```

You should see the padlock icon! 🔒

## That's It!

The certificates will automatically renew every 90 days. No further action needed.

## Troubleshooting

If something goes wrong, see the full `SSL_SETUP.md` guide for detailed troubleshooting steps.

## What Changed in the Code

- `docker-compose.prod.yml` - Added nginx and certbot services
- `nginx/` - New directory with SSL-ready configuration
- Backend now runs on internal network only (accessed via nginx)
- Nginx handles HTTPS and forwards to your app
