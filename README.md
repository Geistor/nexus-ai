NEXUS v100 Bundle

# NEXUS AI v96 Clean Trading Core

Letisztított, stabil operator csomag multi-exchange venue kezeléssel, trading core fókuszban.

## Fő elemek
- Fix mód / Pro mód kapcsolás
- Start / Stop / Kill switch vezérlés
- Supabase trade event napló
- Model registry mentések
- Multi-exchange venue config (Binance, OKX, Bybit, Kraken)
- Venue save / test / disconnect clean core logikával

## Clean core megjegyzés
A venue `Teszt` gomb ebben a csomagban biztonságos kapcsolat-ellenőrzés és validáció. Nem küld valódi megbízást.

## Indítás
```bash
npm install
node backend/index.js
```

Az app alapból a frontend mappát szolgálja ki a backendből.
