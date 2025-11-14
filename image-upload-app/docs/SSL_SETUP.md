# SSL Certificate Setup Guide

This guide will help you set up free SSL certificates from Let's Encrypt for your image upload application.

## Prerequisites

Before starting, ensure:

1. **Your domain is pointing to your server**
   - DNS A record for `yourdomain.com` pointing to your Lightsail server IP
   - DNS A record for `www.yourdomain.com` pointing to your Lightsail server IP
   - Wait for DNS propagation (can take up to 48 hours, usually much faster)

2. **Ports are open**
   - Port 80 (HTTP) - required for Let's Encrypt validation
   - Port 443 (HTTPS) - for secure traffic
   - These should already be open from your initial Lightsail setup

3. **You have SSH access to your Lightsail server**

## Quick Setup (Automated)

### Step 1: SSH into your server

```bash
ssh -i your-key.pem ubuntu@your-server-ip
```

### Step 2: Navigate to your application directory

```bash
cd /home/ubuntu/image-upload-app
```

### Step 3: Make the setup script executable

```bash
chmod +x setup-ssl.sh
```

### Step 4: Run the SSL setup script

```bash
sudo ./setup-ssl.sh
```

The script will:
- Ask for your domain name
- Ask for your email (for Let's Encrypt notifications)
- Update the Nginx configuration
- Obtain SSL certificates
- Restart your application with HTTPS enabled

### Step 5: Verify HTTPS is working

Visit your domain: `https://yourdomain.com`

You should see a padlock icon in your browser indicating a secure connection!

---

## Manual Setup (If Automated Fails)

### Step 1: Update Nginx Configuration

Edit `nginx/conf.d/app.conf` and replace all instances of `YOUR_DOMAIN_HERE` with your actual domain:

```bash
nano nginx/conf.d/app.conf
```

Replace:
- `YOUR_DOMAIN_HERE` → `yourdomain.com`

Save and exit (Ctrl+X, Y, Enter)

### Step 2: Create Certbot Directories

```bash
mkdir -p certbot/www
mkdir -p certbot/conf
```

### Step 3: Start Nginx for Certificate Validation

```bash
docker compose -f docker-compose.prod.yml up -d nginx
```

### Step 4: Obtain SSL Certificate

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d yourdomain.com \
  -d www.yourdomain.com
```

Replace `your-email@example.com` and `yourdomain.com` with your actual values.

### Step 5: Restart All Services

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Step 6: Verify

Visit `https://yourdomain.com` - you should see your site with a valid SSL certificate!

---

## Certificate Auto-Renewal

The certbot container is configured to automatically check for certificate renewal every 12 hours. Certificates are valid for 90 days and will be renewed automatically when they have 30 days or less remaining.

You can manually trigger a renewal test with:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew --dry-run
```

---

## Troubleshooting

### Issue: "Connection refused" or "ERR_CONNECTION_REFUSED"

**Solution:**
- Verify Docker containers are running: `docker ps`
- Check Nginx logs: `docker logs image-upload-nginx`
- Ensure ports 80 and 443 are open in Lightsail firewall

### Issue: "Certificate validation failed"

**Solution:**
- Verify DNS is pointing to your server: `nslookup yourdomain.com`
- Ensure port 80 is accessible from the internet
- Check Nginx is serving the ACME challenge correctly

### Issue: "Too many certificates already issued"

**Solution:**
- Let's Encrypt has rate limits (5 certificates per domain per week)
- Wait a week or use a subdomain instead
- For testing, add `--dry-run` flag to the certbot command

### Issue: Site still shows "Not Secure"

**Solution:**
- Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache
- Check certificate paths in `nginx/conf.d/app.conf` match your domain
- Verify certificates exist: `ls certbot/conf/live/yourdomain.com/`

### Issue: Mixed content warnings

**Solution:**
- Ensure `FRONTEND_URL` in your `.env` file uses `https://`
- Update any hardcoded `http://` URLs in your code to use `https://`

---

## Security Best Practices

1. **HSTS (HTTP Strict Transport Security)** - Already configured in Nginx
2. **Automatic HTTP to HTTPS redirect** - Already configured
3. **Modern TLS protocols only** - TLSv1.2 and TLSv1.3 enabled
4. **Strong cipher suites** - Configured for security
5. **Regular updates** - Keep Docker images updated

---

## Updating After SSL Setup

When you deploy code changes via GitHub Actions, the SSL certificates will persist because they're stored in the `certbot/` directory on your server, not in the Docker container.

Your deployment will:
1. Pull latest code
2. Rebuild containers
3. Nginx will automatically use existing certificates
4. No SSL configuration needed on subsequent deploys

---

## Checking SSL Certificate Status

### View certificate expiration date:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certificates
```

### Test SSL configuration:

Visit: https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com

This will give you a security grade for your SSL setup (aim for A or A+).

---

## Support

If you encounter issues:

1. Check the logs:
   ```bash
   docker logs image-upload-nginx
   docker logs image-upload-certbot
   ```

2. Verify DNS propagation:
   ```bash
   dig yourdomain.com
   ```

3. Test certificate renewal:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm certbot renew --dry-run
   ```

---

## What's Been Configured

- ✅ Nginx reverse proxy with SSL termination
- ✅ Let's Encrypt free SSL certificates
- ✅ Automatic HTTP to HTTPS redirect
- ✅ Certificate auto-renewal every 12 hours
- ✅ Modern TLS 1.2 and 1.3 protocols
- ✅ Strong cipher suites
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ Optimized for performance (gzip, caching)

Your application is now production-ready with enterprise-grade security! 🔒
