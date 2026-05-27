# Production deployment

**WhatsApp bot only (no web UI)?** See **[DEPLOYMENT-AWS.md](./DEPLOYMENT-AWS.md)** — backend on AWS is enough; skip frontend build.

## Prerequisites

- Node.js 20+
- HTTPS domain (required for WhatsApp webhook)
- Sandbox **live** API key + secret
- Meta WhatsApp **permanent** access token + production phone number ID
- MongoDB Atlas cluster
- E-Way Bill portal API credentials per taxpayer

## 1. Environment

Copy `.env.production.example` to `.env` on the server and fill all values.

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `SANDBOX_BASE_URL` | Confirm with Sandbox for live (default `https://api.sandbox.co.in`) |
| `PUBLIC_WEBHOOK_URL` | `https://your-api-domain.com` (no trailing slash) |
| `WHATSAPP_TOKEN` | System User token (not 24h temp token) |
| `MONGODB_URI` | Atlas connection string |
| `PHONE_REGISTRY_SECRET` | Strong random string (16+ chars), unique per environment |

## 2. Build frontend

Set API URL at **build time**:

```bash
export VITE_API_URL=https://api.yourdomain.com
npm run build:prod
```

If API and web share one domain:

```bash
export VITE_API_URL=https://app.yourdomain.com
npm run build:prod
```

## 3. Start server

```bash
npm run start:prod
```

The backend serves `frontend/dist` when present (SPA + `/api` on same host).

Or use PM2:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

## 4. Meta WhatsApp webhook

- Callback URL: `https://YOUR_DOMAIN/api/whatsapp/webhook`
- Verify token: same as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to `messages`

Check:

```bash
curl https://YOUR_DOMAIN/api/health
curl https://YOUR_DOMAIN/api/whatsapp/status
```

`canSendMessages` must be `true`.

## 5. Reverse proxy (recommended)

Use nginx/Caddy in front of Node:

- TLS termination
- Proxy `https://yourdomain.com` → `http://127.0.0.1:5001`

## 6. Git

Never commit `.env`. Only commit `.env.example` and `.env.production.example`.

```bash
git add .
git commit -m "Production-ready: Sandbox URL config, static frontend, deployment docs"
```

## Health checks

- `GET /api/health` — MongoDB, WhatsApp token, frontend bundle
- `GET /api/whatsapp/registry` — linked phone records (no passwords)
