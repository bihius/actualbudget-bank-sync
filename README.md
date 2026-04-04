# actualbudget-bank-sync

> Automatic bank transaction sync from **Enable Banking** (PSD2/Open Banking) to **Actual Budget**.

Connect your bank once via a simple web UI — transactions appear in Actual Budget automatically, every 6 hours. Supports 2,500+ banks across 30+ EU countries (Revolut, mBank, ING, Santander, and more).

---

## How it works

```
Your Bank ──── PSD2 OAuth ────> Enable Banking API
                                       │
                                       │  RS256 JWT auth
                                       ▼
                              actualbudget-bank-sync
                              ┌─────────────────────┐
                              │  Web UI  (port 3000) │
                              │  Cron sync (6h)      │
                              │  Account mapping     │
                              └─────────────────────┘
                                       │
                                       │  @actual-app/api
                                       ▼
                               Actual Budget Server
```

1. Authorize your bank in the web UI (OAuth redirect, just like any banking app)
2. Map the bank account to an Actual Budget account (or create a new one)
3. Transactions sync automatically — deduplicated, cleared, with proper payee names

---

## Features

- **Web UI** for bank authorization and account mapping
- **Auto sync** via configurable cron schedule (default: every 6 hours)
- **Deduplication** — safe to run multiple times, no duplicate transactions
- **Create new accounts** directly from the mapping UI
- **2-day overlap window** to prevent missed transactions near sync boundaries
- **Session monitoring** — dashboard shows connection status and expiry dates
- **Per-account error isolation** — one failing account doesn't block others

---

## Requirements

- Docker + Docker Compose
- [Enable Banking](https://enablebanking.com) account with an application created
- RSA private key (2048-bit, registered in Enable Banking)
- [Actual Budget](https://actualbudget.org) self-hosted server
- A public HTTPS URL for the OAuth callback (needed for bank redirect)

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/bihius/actualbudget-bank-sync.git
cd actualbudget-bank-sync
```

### 2. Generate RSA key pair

Enable Banking uses RS256 JWT authentication. Generate a key pair and upload the public key to your [Enable Banking Control Panel](https://enablebanking.com/control-panel) → Application → RSA key.

```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

Upload `keys/public.pem` to Enable Banking. Keep `keys/private.pem` secret — it stays on your server only.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
ENABLE_BANKING_APP_ID=your-enable-banking-app-uuid
ACTUAL_PASSWORD=your-actual-server-password
ACTUAL_SYNC_ID=your-budget-sync-id
REDIRECT_BASE_URL=https://banking.your-domain.com
```

Find your **Sync ID** in Actual Budget: More → Settings → Show advanced settings → Sync ID.

### 4. Register the callback URL

In your Enable Banking Control Panel → Application → Redirect URIs, add:

```
https://banking.your-domain.com/auth/callback
```

This must be a **publicly reachable HTTPS URL** — Enable Banking redirects your browser here after bank authorization.

### 5. Configure Docker network

If Actual Budget runs in Docker on the same host, both containers need to share a network. In your Actual Budget `docker-compose.yml`, ensure the network is named and external:

```yaml
networks:
  actual_default:
    name: actual_default
```

Then set `ACTUAL_SERVER_URL=http://actual:5006` in your `.env.local`.

### 6. Start

```bash
docker compose up -d
docker compose logs -f
```

Open `http://localhost:3000` (or your reverse proxy URL).

---

## Usage

### Connecting a bank

1. Open the web UI → click **Add Bank**
2. Select your bank from the list (filtered by country)
3. Complete the bank's own authorization flow
4. On the mapping screen, select an existing Actual account or create a new one
5. Transactions sync immediately — and automatically every 6 hours

### Dashboard

The dashboard shows all connected accounts with:
- Bank name and IBAN
- Session status (Active / Expired) and expiry date
- Last successful sync date
- Disconnect button

### Manual sync

Click **Sync Now** on the dashboard, or call the API:

```bash
curl -X POST http://localhost:3000/sync/now
```

---

## Reverse proxy

Enable Banking requires a **publicly reachable HTTPS** callback URL. Example configs:

**HAProxy:**
```
acl host_banking hdr(host) -i banking.your-domain.com
use_backend banking if host_banking

backend banking
    server banking 127.0.0.1:3000
```

**Nginx:**
```nginx
server {
    listen 443 ssl;
    server_name banking.your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

---

## Transaction mapping

| Enable Banking field | Actual Budget field | Notes |
|---|---|---|
| `booking_date` | `date` | YYYY-MM-DD |
| `transaction_amount.amount` | `amount` | Integer cents |
| `credit_debit_indicator` DBIT | negative `amount` | Debit = money out |
| `creditor.name` / `debtor.name` | `payee_name` | Depends on direction |
| `remittance_information[]` | `notes` | Joined with space |
| `transaction_id` / `entry_reference` | `imported_id` | Dedup key |
| SHA256 hash (fallback) | `imported_id` | When bank omits ID |
| status `BOOK` only | `cleared: true` | Pending txns skipped |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ENABLE_BANKING_APP_ID` | required | UUID of your Enable Banking app |
| `ENABLE_BANKING_KEY_PATH` | `/keys/private.pem` | Path to RSA private key inside container |
| `ACTUAL_SERVER_URL` | `http://actual:5006` | Actual Budget server URL |
| `ACTUAL_PASSWORD` | required | Actual Budget password |
| `ACTUAL_SYNC_ID` | required | Budget sync ID |
| `REDIRECT_BASE_URL` | required | Public base URL for OAuth callback |
| `SYNC_CRON` | `0 */6 * * *` | Cron schedule for automatic sync |
| `PORT` | `3000` | HTTP port |

---

## Data & security

- **`keys/`** — your RSA private key. Never committed, mounted read-only into the container.
- **`data/state.json`** — persists sessions, account mappings, and last sync dates. Never committed.
- Session tokens from Enable Banking are stored only in `data/state.json` on your server.
- No data is sent anywhere except to Enable Banking API and your local Actual Budget server.

---

## License

MIT
