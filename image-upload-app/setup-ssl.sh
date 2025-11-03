#!/bin/bash

# SSL Certificate Setup Script for Let's Encrypt
# This script helps you obtain SSL certificates for your domain

set -e

echo "==================================="
echo "SSL Certificate Setup for Let's Encrypt"
echo "==================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo: sudo ./setup-ssl.sh"
    exit 1
fi

# Domain is already set to images.cole-brock.com
DOMAIN="images.cole-brock.com"

# Get email address
read -p "Enter your email address for Let's Encrypt notifications: " EMAIL

echo ""
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""
read -p "Is this correct? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
    echo "Setup cancelled."
    exit 0
fi

# Create certbot directories if they don't exist
mkdir -p certbot/www
mkdir -p certbot/conf

# Stop any running containers
echo "Stopping existing containers..."
docker compose -f docker-compose.prod.yml down

# Start Nginx temporarily without SSL to get certificates
echo "Starting Nginx for certificate validation..."
docker compose -f docker-compose.prod.yml up -d nginx

# Wait for Nginx to start
sleep 5

# Obtain SSL certificate
echo "Requesting SSL certificate from Let's Encrypt..."
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# Check if certificate was obtained successfully
if [ -d "certbot/conf/live/$DOMAIN" ]; then
    echo ""
    echo "✅ SSL certificate obtained successfully!"
    echo ""
    echo "Restarting all services with SSL enabled..."
    docker compose -f docker-compose.prod.yml down
    docker compose -f docker-compose.prod.yml up -d

    echo ""
    echo "==================================="
    echo "✅ SSL Setup Complete!"
    echo "==================================="
    echo ""
    echo "Your site should now be accessible at:"
    echo "https://$DOMAIN"
    echo ""
    echo "Certificates will auto-renew every 12 hours via the certbot container."
    echo ""
else
    echo ""
    echo "❌ Failed to obtain SSL certificate."
    echo ""
    echo "Please check:"
    echo "1. Your domain DNS is pointing to this server's IP address"
    echo "2. Ports 80 and 443 are open in your firewall"
    echo "3. No other services are using ports 80 or 443"
    echo ""
    exit 1
fi
