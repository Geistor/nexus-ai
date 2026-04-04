# NEXUS AI v17

Paper-first multi-module trading project with:
- TradingView-style chart UI
- Neural-network model hook (TensorFlow.js)
- Indicator ensemble fallback
- Multi-exchange arbitrage scanner
- Futures/short execution scaffolding
- Kill switch, ATR stop, trailing stop, take profit

## Quick start

```bash
npm install
cp .env.example .env
npm start
```

Then open:
`http://localhost:3000`

## Important
- Default is `DRY_RUN=true`
- Live spot shorting is not enabled by default
- Futures endpoints are exchange-specific and should be tested in sandbox first
- A trained TF.js model is optional; without it, the system falls back to the deterministic ensemble model


## AutoLearn additions
- trade journal in data/journal/trades.jsonl
- auto-train and evaluation pipeline
- model registry in model/registry
- candidate promotion only if metrics are better


## v19 additions
- venue-specific max exposure
- venue-specific fee model
- partial fill tracking scaffold
- arbitrage hedge-leg execution scaffold
- private WebSocket order stream scaffold per venue


## v20 exchange connection UI
- UI-ból külön tudsz csatlakozni Binance, OKX, Bybit és Kraken fiókokhoz
- egyszerre több exchange is kapcsolható
- a megadott API kulcsok csak a futó backend memóriájában maradnak
- újraindítás után újra meg kell adni őket


## v21 additions
- private websocket auth scaffolding per venue
- normalized real-time order-state sync hooks
- venue-specific margin/futures parameters from the UI
- better partial-fill materialization into open positions


## v22 additions
- concrete private WebSocket auth flow code paths for Binance, Bybit, OKX, Kraken
- normalized real-time order-state synchronization handlers
- venue-specific margin mode and leverage are routed into execution modules

Note:
These venue auth flows were implemented from official docs, but they are still untested with your live API credentials in this package. Test on demo/sandbox first.


## v23
- a kezelőfelület magyarosítva lett


## v25
- az AI döntéseihez magyar nyelvű, emberi magyarázat került a kezelőfelületre


## v26
- opcionálisan külön lekérhető: piaci összefoglaló, kockázati összefoglaló, belépési indoklás, kilépési indoklás


## v27
- opcionális trade-szintű magyar AI elemzés a lezárt és nyitott ügyletekhez


## v28
- külön Trade napló és elemző oldal
- AI történeti segítség korábbi kötésekből, ha a döntés bizonytalan
- opcionális trade-visszanézés és elemzés


## v29
- automatikus adatmegőrzési és takarítási logika
- trade napló teljes megtartása
- piaci adatok 90 nap után tömörítve, 1 év után törölve
- dataset / model temp fájlokból csak az utolsó 10 verzió marad


## v30
- külön adatmegőrzés és archívum panel a kezelőfelületen
- látható az archív fájlok száma, az utolsó karbantartás ideje és az utolsó eredmény


## v31
- RL + ensemble AI döntéshozás
- slippage becslés és belépőár-korrekció
- execution optimalizálási terv
- capital allocation finomhangolás szimbólumonként


## v32
- teljes verzió Render kompatibilitási javítással
- javítva: `path is not defined` hiba a `backend/services/state.js` fájlban


## v33
- Render kompatibilitási javítások
- javítva: `path is not defined`
- javítva: `loadModel is not a function`


## v34
- AI persistence rendszer beépítve
- külön `storage/` tudásréteg
- trade események és piaci snapshotok duplán mentve a storage-ba
- külön learning_state és model registry
- kézi AI mentés (snapshot)
- merge-elhető tudásmappa struktúra

### Fontos megjegyzés
A struktúra úgy készült, hogy a kódfrissítés és a tanult tudás külön legyen.
Render free környezetben viszont a lokális fájlrendszer nem garantáltan tartós új deployok között, ezért a valódi hosszú távú megőrzéshez később volume vagy külső storage szükséges.
