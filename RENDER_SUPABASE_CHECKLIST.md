# Render + Supabase checklist

## Render

- Environment: Node
- Build Command: `npm install`
- Start Command: `node backend/index.js`
- Root Directory: üresen hagyható

## Kötelező env-ek

- `PORT`
- `TRADING_MODE=paper`
- `ALLOW_LIVE_TRADING=false`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Opcionális env-ek

- `BINANCE_BASE_URL`
- `OKX_BASE_URL`
- `BYBIT_BASE_URL`
- `KRAKEN_BASE_URL`
- exchange API kulcsok

## Supabase

A projekt jelenlegi táblái:

- `system_state`
- `trade_events`
- `model_registry`

Ha később RLS-t kapcsolsz, előbb állíts be megfelelő policy-kat.
