
# Render telepítés lépésről lépésre

## 1. GitHub
A zip kicsomagolt tartalmát töltsd fel a GitHub repóba.

## 2. Render
- New +
- Web Service
- Connect a repohoz

## 3. Beállítások
- Name: `nexus-ai`
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `node backend/index.js`

## 4. Környezeti változók
- `TRADING_MODE=paper`
- `ALLOW_LIVE_TRADING=false`
- `BINANCE_BASE_URL=https://fapi.binance.com`
- `OKX_BASE_URL=https://www.okx.com`

## 5. Opcionális kulcsok
- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `OKX_API_KEY`
- `OKX_API_SECRET`
- `OKX_PASSPHRASE`

## 6. Első indítás
Paper módban induljon.
