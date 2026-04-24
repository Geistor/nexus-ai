# DEPLOY CHECKLIST — v93 Operator Stable Pack

## Render
- Build command: `npm install`
- Start command: `node backend/index.js`
- Port env: `PORT=10000`

## Environment
- `NODE_ENV=production`
- `AUTO_TRAIN=true`
- `DRY_RUN=true` vagy a kívánt érték
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`

## Supabase táblák
- `system_state`
- `trade_events`
- `model_registry`

## Smoke test
- Fix mód
- Pro mód
- Indítás
- Leállítás
- Vész stop
- AI mentés
- Training futtatása
- Adatkarbantartás
