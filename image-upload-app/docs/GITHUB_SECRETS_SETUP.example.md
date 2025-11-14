# GitHub Secrets Setup Template

**⚠️ This is a template file. DO NOT commit your actual secrets!**

This guide shows you how to set up GitHub repository secrets for CI/CD deployments.

## Where to Add Secrets

Go to your GitHub repository:
```
https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions
```

Click **"New repository secret"** for each secret below.

## Required Secrets for Production Deployment

### 1. Database Configuration

**MONGO_USERNAME**
```
admin
```

**MONGO_PASSWORD**
```
[Generate a strong password - use: openssl rand -base64 32]
```

**MONGODB_URI** (Complete connection string)
```
mongodb://admin:[YOUR_MONGO_PASSWORD]@mongodb:27017/image-upload-app?authSource=admin
```

### 2. Application Secrets

**JWT_SECRET** (For authentication tokens)
```
[Generate with: openssl rand -hex 32]
Example output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**FRONTEND_URL** (Your production domain)
```
https://your-domain.com
```

### 3. AWS Configuration (if using S3)

**AWS_REGION**
```
us-east-1
(or your preferred region)
```

**AWS_ACCESS_KEY_ID**
```
AKIA****************
(Get from AWS IAM Console)
```

**AWS_SECRET_ACCESS_KEY**
```
****************************************
(Get from AWS IAM Console - NEVER share this!)
```

**S3_BUCKET_NAME**
```
your-bucket-name-2025
```

**USE_S3**
```
true
```

### 4. Admin User Configuration

**DEFAULT_ADMIN_USERNAME**
```
your_admin_username
```

**DEFAULT_ADMIN_EMAIL**
```
admin@your-domain.com
```

**DEFAULT_ADMIN_PASSWORD**
```
[Generate a strong password - use: openssl rand -base64 32]
```

### 5. Server Configuration (Optional)

**BACKEND_URL**
```
https://api.your-domain.com
(or https://your-domain.com if backend is on same domain)
```

## Security Best Practices

### Generating Secure Secrets

```bash
# Generate JWT secret (64 characters)
openssl rand -hex 32

# Generate strong password (32 characters)
openssl rand -base64 32

# Generate random API key
openssl rand -base64 24
```

### Important Security Rules

1. ✅ **DO:**
   - Generate unique secrets for each environment (dev/staging/prod)
   - Rotate secrets regularly (every 90 days minimum)
   - Use environment-specific AWS credentials
   - Enable GitHub secret scanning
   - Audit secret access in GitHub

2. ❌ **DON'T:**
   - Reuse secrets across environments
   - Share secrets via email or chat
   - Commit secrets to version control
   - Use weak or default passwords
   - Give secrets overly broad access

### Secret Rotation Schedule

| Secret Type | Rotation Frequency | Notes |
|-------------|-------------------|-------|
| JWT_SECRET | Every 90 days | Invalidates all existing tokens |
| Admin Password | Every 60 days | Change via app interface |
| MongoDB Password | Every 90 days | Update in all configs |
| AWS Keys | Every 90 days | Create new, test, then delete old |

## Testing Secrets

After adding secrets, test your deployment:

1. Trigger a GitHub Actions workflow
2. Check the workflow logs for errors
3. Verify the application starts correctly
4. Test login and core functionality
5. Monitor for any secret-related errors

## Troubleshooting

### Secret Not Found
- Check secret name matches exactly (case-sensitive)
- Verify secret is set at repository level (not organization)
- Refresh GitHub Actions cache

### Authentication Failures
- Verify MongoDB password doesn't contain special characters that need escaping
- Check MONGODB_URI format is correct
- Ensure JWT_SECRET is set correctly

### AWS Connection Issues
- Verify AWS credentials have correct permissions
- Check AWS region matches S3 bucket region
- Ensure USE_S3 is set to "true" (as string)

---

**Remember:**
- Keep this template updated as your infrastructure evolves
- Document any custom secrets you add
- Never commit the filled version to git (it should be in `.gitignore`)
