# AWS deployment — backend only (WhatsApp bot)

You **do not need the frontend** for the WhatsApp bot. Only the Node backend must be public over **HTTPS** so Meta can call your webhook.

## What runs on AWS

| Component | On AWS? |
|-----------|---------|
| Express API (`/api/whatsapp/webhook`) | Yes |
| MongoDB Atlas | No (stays on Atlas; backend connects outbound) |
| Sandbox E-Way Bill API | No (outbound from AWS) |
| React frontend | **Not required** |

Skip `npm run build:prod` on the server. You can ignore `VITE_API_URL` and `frontend/dist`.

## Architecture

```
User WhatsApp  →  Meta Cloud API  →  https://api.yourdomain.com/api/whatsapp/webhook
                                              ↓
                                         EC2 (Node + PM2)
                                              ↓
                                    MongoDB Atlas (MONGODB_URI)
                                    Sandbox API (SANDBOX_*)
```

## Option A — EC2 (recommended to start)

### 1. Launch EC2

- **AMI:** Ubuntu 22.04 LTS
- **Instance:** t3.small or t3.micro (micro is OK for low traffic)
- **Security group inbound:**
  - `22` — SSH (your IP only)
  - `80` — HTTP (for redirect / Let’s Encrypt)
  - `443` — HTTPS
- **Elastic IP** — attach so the IP does not change after reboot

### 2. Domain (recommended)

Point a subdomain to the Elastic IP, e.g.:

- `api.yourcompany.com` → Elastic IP

Use **Route 53** or your DNS provider.

Meta needs a **stable HTTPS URL**, not a raw IP (certificates need a domain).

### 3. Install on the server

```bash
sudo apt update && sudo apt install -y git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 4. Deploy code

```bash
git clone YOUR_REPO_URL eway
cd eway
cp .env.production.example .env
nano .env   # fill secrets (see below)
npm install
# Do NOT run npm run build:prod — no frontend needed
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 5. Production `.env` (WhatsApp-only minimum)

```env
NODE_ENV=production
LOG_LEVEL=info
PORT=5001

# Not used by WhatsApp; required by CORS middleware — set to your API URL or any https URL
FRONTEND_URL=https://api.yourdomain.com

SANDBOX_API_KEY=your_live_key
SANDBOX_API_SECRET=your_live_secret
SANDBOX_BASE_URL=https://api.sandbox.co.in
SANDBOX_API_VERSION=1.0.0
SANDBOX_API_SOURCE=primary

WHATSAPP_TOKEN=permanent_system_user_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_random_verify_string
WHATSAPP_API_VERSION=v25.0
PUBLIC_WEBHOOK_URL=https://api.yourdomain.com

MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=eway_prod
PHONE_REGISTRY_SECRET=long_random_secret_min_16_chars
MAX_PHONES_PER_ACCOUNT=10
```

### 6. Nginx + HTTPS (reverse proxy to Node)

```nginx
# /etc/nginx/sites-available/eway
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/eway /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

### 7. MongoDB Atlas

- Network Access → add EC2 **Elastic IP** (or `0.0.0.0/0` temporarily for testing, then restrict).

### 8. Meta WhatsApp webhook

| Field | Value |
|-------|--------|
| Callback URL | `https://api.yourdomain.com/api/whatsapp/webhook` |
| Verify token | Same as `WHATSAPP_VERIFY_TOKEN` in `.env` |
| Fields | `messages` |

### 9. Verify

```bash
curl https://api.yourdomain.com/api/health
curl https://api.yourdomain.com/api/whatsapp/status
```

Expect:

- `"mongodb": "connected"`
- `"canSendMessages": true`

Send `hi` on WhatsApp to your business number.

---

## Option B — AWS App Runner / Elastic Beanstalk

Same app: deploy `backend` with `npm start`, set env vars in the console, attach custom domain + ACM certificate. Good if you prefer managed platforms over EC2 + nginx.

---

## WhatsApp token reminder

Use a **permanent** System User token in Meta Business Manager. Temporary tokens expire in ~24 hours and the bot will stop replying.

---

## What you can skip

- `npm run build:prod`
- `VITE_API_URL`
- Hosting `frontend/dist`
- ngrok (replaced by `https://api.yourdomain.com`)

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| No webhook POSTs | `PUBLIC_WEBHOOK_URL` matches domain; Meta webhook subscribed |
| 401 on send | Refresh `WHATSAPP_TOKEN`; `/api/whatsapp/status` |
| MongoDB error | Atlas IP whitelist; `MONGODB_URI` |
| Part B fails | Live `SANDBOX_API_KEY` / secret; taxpayer credentials |
