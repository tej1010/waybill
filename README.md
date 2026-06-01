# Eway Monorepo

Node.js backend and React frontend in a single repository.

## Structure

```
├── backend/     # Express API (port 5000)
├── frontend/    # React + Vite (port 3000)
└── package.json # npm workspaces root
```

## Setup
##do it 

```bash
npm install
```

Environment variables live in the root `.env` file. For login, set your Sandbox credentials:

| Variable | Description |
|----------|-------------|
| `SANDBOX_API_KEY` | Sandbox API key (`x-api-key`) |
| `SANDBOX_API_SECRET` | Sandbox API secret (used to get JWT via `/authenticate`) |
| `SANDBOX_API_VERSION` | Default `1.0.0` |
| `SANDBOX_API_SOURCE` | Default `primary` |

**Two-step auth:** Backend calls `POST /authenticate` (key + secret) → JWT, then e-Way Bill `tax-payer/authenticate` with that JWT. Use **test** keys with `api.sandbox.co.in`; **live** keys need the live base URL.

### Login API

`POST /api/auth/login` — body: `{ username, password, gstin }` — proxies to Sandbox e-Way Bill tax payer authenticate.

`PUT /api/eway-bill/:ewbNo/vehicle` — updates Part B ([docs](https://developer.sandbox.co.in/api-reference/gst/compliance/endpoints/e-way-bill/consignor/update_vehicle_details)).

`GET /api/eway-bill/:ewbNo/pdf` — fetches bill via [Get E-Way Bill](https://developer.sandbox.co.in/api-reference/gst/compliance/endpoints/e-way-bill/common/get_e_way_bill) and returns a printable PDF (QR + barcode + Part A/B).

After Part B update, the PDF downloads automatically. Use **Download e-Way Bill PDF** for any bill number.

`POST /api/eway-bill/:ewbNo/extend` — extends validity ([docs](https://developer.sandbox.co.in/api-reference/gst/compliance/endpoints/e-way-bill/consignor/extend_validity)).

## Development

Run both apps:

```bash
npm run dev
```

Or run separately:

```bash
npm run dev:backend   # http://localhost:5001 (avoid 5000 — used by macOS AirPlay)
npm run dev:frontend  # http://localhost:3000
```

The frontend proxies `/api` requests to the backend.

## WhatsApp Bot

Uses [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api). Each user's WhatsApp number gets its own session (login + E-Way Bill token).

### Setup

1. Create a Meta app → WhatsApp → get **Phone number ID** and **Access token**
2. Add to `.env`:
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_VERIFY_TOKEN` (any random string)
3. Webhook URL: `https://YOUR_NGROK_OR_DOMAIN/api/whatsapp/webhook`
4. Verify token: same as `WHATSAPP_VERIFY_TOKEN` in `.env`
5. `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_TOKEN` — both work
5. Subscribe to `messages` field

Local testing: use [ngrok](https://ngrok.com) → `ngrok http 5001`

Check config: `GET http://localhost:5001/api/whatsapp/status`

### Logs

When you send a WhatsApp message, the backend should show:

```
[whatsapp] POST /webhook hit
[whatsapp] ━━━━ POST /webhook received ━━━━
[whatsapp] ▶ Incoming text message { from, text }
[whatsapp] ◀ Reply sent to WhatsApp
```

If you only see `statusCount: 1` and `messageCount: 0`, Meta received a delivery receipt — send a **text** from your phone to the business number.

### Local test (no WhatsApp)

```bash
curl -X POST http://localhost:5001/api/whatsapp/test \
  -H "Content-Type: application/json" \
  -d '{"phone":"YOUR_WHATSAPP_NUMBER_WITH_COUNTRY_CODE","text":"hi"}'
```

### Bot flow

| Step | User action |
|------|-------------|
| Start | Send `hi` |
| Login | User ID → Password → GSTIN |
| Menu | `1` = Update Part B, `2` = Logout |
| Part B | EWB no → Mode (1 Road / 2 Rail / 3 Air) → fields per mode → Reason 1–3 |

Same Part B rules as the web app (date & vehicle type set automatically for Road).

## Production

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for full checklist.

```bash
export VITE_API_URL=https://your-api-domain.com
npm run build:prod
npm run start:prod
```

- All Sandbox API calls use `SANDBOX_BASE_URL` (JWT, login, e-Way Bill).
- Backend serves `frontend/dist` when built (single-host deploy).
- `GET /api/health` reports MongoDB, WhatsApp token, and config status.

PM2: `pm2 start ecosystem.config.cjs`
