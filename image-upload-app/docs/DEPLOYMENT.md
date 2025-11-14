# AWS Deployment Guide

Deploy your image upload app to AWS Lightsail with automatic deployments from GitHub.

**Cost:** ~$4/month ($3.50 Lightsail + ~$0.50 S3)

---

## Prerequisites

- AWS account
- GitHub account
- Your AWS domain (from Route 53)

---

## Part 1: AWS Setup (~10 minutes)

### Step 1: Create S3 Bucket for Images

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click **"Create bucket"**
3. **Bucket name:** Choose a unique name (e.g., `your-app-images-2024`)
4. **Region:** Choose closest to you (e.g., `us-east-1`)
5. **Block Public Access:** UNCHECK all boxes (we need public access for images)
6. Click **"Create bucket"**
7. **Make bucket public:**
   - Click on your bucket
   - Go to **Permissions** tab
   - Click **"Bucket Policy"**
   - Paste this policy (replace `YOUR-BUCKET-NAME`):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
       }
     ]
   }
   ```
   - Click **Save**

### Step 2: Create IAM User with S3 Access

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Click **"Users"** → **"Create user"**
3. **User name:** `image-app-user`
4. Click **Next**
5. **Permissions:** Select **"Attach policies directly"**
6. Search and select **"AmazonS3FullAccess"**
7. Click **Next** → **Create user**
8. Click on the new user → **"Security credentials"** tab
9. Click **"Create access key"**
10. Select **"Application running outside AWS"**
11. Click **Next** → **Create access key**
12. **SAVE THESE SOMEWHERE SAFE:**
    - Access key ID
    - Secret access key
13. Click **Done**

### Step 3: Create AWS Lightsail Instance

1. Go to [AWS Lightsail Console](https://lightsail.aws.amazon.com/)
2. Click **"Create instance"**
3. **Instance location:** Choose closest region
4. **Platform:** Linux/Unix
5. **Blueprint:** OS Only → **Ubuntu 22.04 LTS**
6. **Instance plan:** $3.50/month (512 MB RAM, 1 vCPU)
7. **Instance name:** `image-upload-app`
8. Click **"Create instance"**
9. Wait ~2 minutes for it to start
10. Click on the instance → **"Networking"** tab
11. Under **"IPv4 Firewall"**, ensure these ports are open:
    - SSH (port 22) ✅ Already open
    - HTTP (port 80) - Click **"Add rule"** → Port 80 → **Save**
12. **Note down the Public IP address** (e.g., `18.123.45.67`)

### Step 4: SSH into Lightsail and Install Docker

1. Click on your instance → Click **"Connect using SSH"** (orange button)
2. A terminal will open. Run these commands one by one:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Verify Docker works
docker --version
```

You should see something like `Docker version 24.0.7`

3. **Download SSH Key for GitHub Actions:**
   - In the Lightsail console, click on your instance
   - Click **"Account"** (top right) → **"SSH keys"**
   - Download the default key for your region
   - Save it somewhere safe (you'll need the contents later)

---

## Part 2: GitHub Setup (~5 minutes)

### Step 5: Create GitHub Repository

1. Go to [GitHub](https://github.com)
2. Click **"New repository"**
3. **Repository name:** `image-upload-app`
4. **Visibility:** Private (or Public if you want)
5. **DON'T** check "Initialize with README"
6. Click **"Create repository"**

### Step 6: Push Your Code to GitHub

Open Command Prompt/Terminal in your app directory and run:

```bash
cd C:\Users\coleb\Desktop\random_coding_stuff\ai\image-upload-app

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - ready for deployment"

# Add remote (replace YOUR-USERNAME)
git remote add origin https://github.com/YOUR-USERNAME/image-upload-app.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 7: Add GitHub Secrets

1. Go to your GitHub repository
2. Click **"Settings"** → **"Secrets and variables"** → **"Actions"**
3. Click **"New repository secret"** for each of these:

| Secret Name | Value |
|------------|-------|
| `AWS_ACCESS_KEY_ID` | From Step 2 (IAM user access key) |
| `AWS_SECRET_ACCESS_KEY` | From Step 2 (IAM user secret key) |
| `AWS_REGION` | Your S3 region (e.g., `us-east-1`) |
| `S3_BUCKET_NAME` | Your S3 bucket name from Step 1 |
| `LIGHTSAIL_HOST` | Your Lightsail public IP from Step 3 |
| `LIGHTSAIL_USERNAME` | `ubuntu` |
| `LIGHTSAIL_SSH_KEY` | Paste entire contents of SSH key file from Step 4 |

**For the SSH key:** Open the .pem file in Notepad, copy EVERYTHING (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`), and paste it.

---

## Part 3: Point Your Domain (~5 minutes)

### Step 8: Configure Route 53

1. Go to [Route 53 Console](https://console.aws.amazon.com/route53/)
2. Click **"Hosted zones"**
3. Click on your domain
4. Click **"Create record"**
5. **Record configuration:**
   - **Record name:** Leave blank (for root domain) or enter `app` (for app.yourdomain.com)
   - **Record type:** A
   - **Value:** Your Lightsail IP address from Step 3
   - **TTL:** 300
6. Click **"Create records"**

---

## Part 4: Deploy! (~2 minutes)

### Step 9: Trigger Deployment

1. Go to your GitHub repository
2. Click **"Actions"** tab
3. Click **"Deploy to AWS Lightsail"** workflow
4. Click **"Run workflow"** → **"Run workflow"**
5. Wait ~3-5 minutes for deployment to complete
6. You'll see green checkmarks when done ✅

### Step 10: Test Your App

Visit your domain: `http://yourdomain.com` (or `http://app.yourdomain.com`)

You should see your app! 🎉

---

## Automatic Deployments

From now on, whenever you push to the `main` branch, your app will automatically deploy!

```bash
# Make changes to your code
# ...

# Commit and push
git add .
git commit -m "Updated feature XYZ"
git push

# GitHub Actions will automatically deploy!
```

---

## Troubleshooting

### App not loading?

1. Check GitHub Actions logs:
   - Go to **Actions** tab
   - Click on latest workflow run
   - Look for red ❌ errors

2. SSH into Lightsail and check Docker:
   ```bash
   docker ps
   docker logs image-upload-app
   ```

### Images not uploading?

1. Check S3 bucket policy is correct
2. Verify secrets in GitHub are correct
3. Check Docker logs: `docker logs image-upload-app`

### Domain not working?

1. Wait 5-10 minutes for DNS propagation
2. Try `http://` instead of `https://` (HTTPS setup is separate)
3. Verify Route 53 record points to correct IP

---

## Cost Breakdown

- **Lightsail:** $3.50/month
- **S3 Storage:** ~$0.023 per GB/month
- **S3 Bandwidth:** First 100 GB free/month
- **Route 53:** $0.50/month per hosted zone

**Estimated Total:** ~$4-5/month

---

## Next Steps

### Enable HTTPS (Optional)

1. SSH into Lightsail
2. Install Certbot:
   ```bash
   sudo apt install certbot
   ```
3. Get SSL certificate:
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com
   ```
4. Update Docker run command to use port 443

### Set Up Backups

1. Go to Lightsail console
2. Click on your instance → **"Snapshots"** tab
3. Click **"Create snapshot"** (first 3 snapshots free)

---

## Support

If you run into issues:
1. Check GitHub Actions logs
2. Check Docker logs: `docker logs image-upload-app`
3. Verify all GitHub secrets are correct
4. Make sure S3 bucket is public

Your app is now live! 🚀
