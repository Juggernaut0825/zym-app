# ZYM Fitness Coaching App - Deployment Guide

## Production Deployment with PM2

### 1. Server Deployment

```bash
# Install PM2 globally
npm install -g pm2

# Build the server
cd server
npm run build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 2. PM2 Configuration

Create `server/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'zym-websocket',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        WEBSOCKET_PORT: 8080,
        API_PORT: 3001
      }
    }
  ]
};
```

### 3. Nginx Configuration

```nginx
# /etc/nginx/sites-available/zym

upstream websocket {
    server localhost:8080;
}

upstream api {
    server localhost:3001;
}

server {
    listen 80;
    server_name zym.example.com;

    location /ws {
        proxy_pass http://websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /api {
        proxy_pass http://api;
    }

    location / {
        proxy_pass http://localhost:3000;
    }
}
```

### 4. SSL with Let's Encrypt

```bash
sudo certbot --nginx -d zym.example.com
```

### 5. Database Backup

```bash
# Daily backup cron job
0 2 * * * mysqldump -u root zym > /backups/zym_$(date +\%Y\%m\%d).sql
```

## Monitoring

```bash
# View logs
pm2 logs zym-websocket

# Monitor resources
pm2 monit

# Restart
pm2 restart zym-websocket
```
