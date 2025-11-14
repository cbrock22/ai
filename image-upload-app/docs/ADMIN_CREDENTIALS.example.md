# Admin Credentials Template

**⚠️ This is a template file. DO NOT commit your actual credentials!**

## Default Admin User

When you first start the application, a default admin user is created automatically:

```
Username: [YOUR_ADMIN_USERNAME]
Email:    [YOUR_ADMIN_EMAIL]
Password: [YOUR_ADMIN_PASSWORD]
```

## Configuration

These credentials are set via environment variables in `docker-compose.dev.yml`:

```yaml
DEFAULT_ADMIN_USERNAME: ${DEFAULT_ADMIN_USERNAME:-your_username}
DEFAULT_ADMIN_EMAIL: ${DEFAULT_ADMIN_EMAIL:-your@email.com}
DEFAULT_ADMIN_PASSWORD: ${DEFAULT_ADMIN_PASSWORD:-YourSecurePassword123!}
```

## Security Best Practices

1. **Change the default password immediately** after first login
2. Use a strong password (12+ characters, mixed case, numbers, symbols)
3. Never commit actual credentials to version control
4. Store credentials in environment variables or a password manager
5. Rotate credentials regularly

## For Production

For production deployments, set these environment variables:
- In your `.env` file (which should be in `.gitignore`)
- In your CI/CD secrets (GitHub Secrets, etc.)
- In your hosting platform's environment variables

**Never use default or weak passwords in production!**
