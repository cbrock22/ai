# Your S3 Configuration Template

**⚠️ This is a template file. DO NOT commit your actual AWS credentials!**

## Current S3 Configuration

Copy this file to `YOUR_S3_CONFIG.md` (which is gitignored) and fill in your actual values.

### AWS Credentials
- **Profile**: `[your-aws-profile-name]`
- **Access Key**: `AKIA****************` (get from AWS IAM Console)
- **Secret Key**: `****************************************` (get from AWS IAM Console)
- **Region**: `us-east-1` (or your preferred region)
- **Stored**: `~/.aws/credentials` (on your local machine)

### S3 Bucket
- **Name**: `your-bucket-name-here`
- **Region**: `us-east-1` (must match AWS Region above)
- **Created**: [Date you created the bucket]

## Setup Instructions

### 1. Create AWS Account
1. Go to https://aws.amazon.com
2. Create an account or sign in
3. Set up billing alerts (recommended)

### 2. Create S3 Bucket
```bash
aws s3 mb s3://your-bucket-name-here --region us-east-1
```

### 3. Create IAM User
1. Go to AWS Console → IAM → Users
2. Create a new user with programmatic access
3. Attach policy: `AmazonS3FullAccess` (or create custom policy)
4. Save the Access Key ID and Secret Access Key

### 4. Configure AWS CLI
```bash
aws configure --profile your-profile-name
# Enter Access Key ID
# Enter Secret Access Key
# Enter Default region (e.g., us-east-1)
# Enter Default output format (e.g., json)
```

### 5. Set Environment Variables

Add to your `.env` file:
```env
USE_S3=true
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
S3_BUCKET_NAME=your-bucket-name-here
```

## Security Notes

- **NEVER** commit AWS credentials to version control
- Use IAM roles when possible (for EC2/ECS deployments)
- Create separate users for dev/staging/production
- Enable MFA on your AWS account
- Regularly rotate access keys
- Use least-privilege IAM policies
- Enable S3 bucket versioning and encryption

## Quick Reference

```bash
# List buckets
aws s3 ls

# Upload file
aws s3 cp file.jpg s3://your-bucket-name/

# Download file
aws s3 cp s3://your-bucket-name/file.jpg ./

# Sync directory
aws s3 sync ./uploads s3://your-bucket-name/uploads/
```

---

**Remember:** Keep `YOUR_S3_CONFIG.md` private and never commit it!
