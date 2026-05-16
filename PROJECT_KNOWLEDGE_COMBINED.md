

# FILE: ALL_IN_V2_OVERVIEW.md

# ALL-IN V2 áttekintés

## Mit tartalmaz ez a csomag

Ez az összevont csomag egy működő alapot ad a következőkhöz:

- UI restore + teljes fő dashboard
- exchange kapcsolat panelek
- paper / staging / live módok
- execution teszt és backend API
- Supabase alapú perzisztencia
- renderes deploy alapkonfig
- state / trade / model tárolás
- order lifecycle és execution bus kiindulási réteg

## Fontos

Ez egy integrált fejlesztői csomag. Éles használat előtt mindig:

1. paper módban tesztelj
2. ellenőrizd az összes kulcsot és endpointot
3. nézd át a logokat Renderben
4. kapcsold be külön a live funkciókat
5. csak whitelistelt symbolokkal indulj

## Ajánlott első ellenőrzés

- `/api/health`
- `/api/system/snapshot`
- dashboard betöltődik-e
- Supabase táblák elérhetők-e
- AI mentés / távoli sync működik-e


# FILE: DEPLOY_CHECKLIST_V93.md

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


# FILE: README.md

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


# FILE: RENDER_SETUP_HU.md


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


# FILE: RENDER_SUPABASE_CHECKLIST.md

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


# FILE: RENDER_BUILD_FIX_v125_1.txt

V125.1 Render build fix

Render dashboard Build Command:
npm install --omit=dev --no-audit --no-fund --loglevel=info

Start Command:
node backend/index.js


# FILE: RENDER_BUILD_FIX_v126_1.txt

V126.1 restore + Render build fix

Ez a csomag a v125 FULL AUTO AI TRADING ENGINE teljes UI/backend alapját tartja meg, nem a lebutított no-npm verziót.

Mit javít:
- package-lock.json eltávolítva, mert korábban belső / nem publikus registry URL-eket tartalmazott, amit Render nem tud letölteni.
- .npmrc kényszeríti a publikus npm registry-t: https://registry.npmjs.org/
- Node verzió fixálva: 20.x. Így Render nem választ Node 25-öt.
- render.yaml buildCommand: npm install --omit=dev --legacy-peer-deps --no-audit --no-fund
- Minden korábbi nagy panel és Auto AI trader funkció visszamarad.

Render kézi beállítás, ha a Render UI felülírja a render.yaml-t:
Build Command:
npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

Start Command:
node backend/index.js

Environment variable:
NODE_VERSION=20.x

Fontos Binance:
Futures auth teszthez a Binance kártyán a Tesztkörnyezet pipa legyen KI. A Futures + Testnet kombináció CCXT/Binance oldalon nem támogatott.


# FILE: RENDER_FIX_NOTE.txt

Ez a teljes verzió javítva lett a Render hibához.
Javítás: backend/services/state.js fájlban a path import hozzáadva.
Ez NEM a light verzió, hanem a teljes v31 javított csomagja.


# FILE: RENDER_FIX_NOTE_v33.txt

Render javított teljes verzió.
Javítások:
1. backend/services/state.js -> hiányzó path import hozzáadva
2. backend/index.js -> loadModel helyett loadActiveModel használat
Ez a teljes verzió, nem a light csomag.


# FILE: RENDER_NO_INSTALL_FIX_v125_2.txt

V125.2 Render hard fix

A Render build azért állt meg az npm install résznél, mert a korábbi package-lock belső registry URL-eket tartalmazott és/vagy az npm telepítés a Renderen elakadt.

Ez a verzió nem használ külső npm csomagokat. A backend Node.js beépített http/fetch/crypto modulokkal fut.

Render beállítás:
Build Command:
node -e "console.log('NEXUS build skipped: no external npm packages required')"

Start Command:
node backend/index.js


# FILE: RENDER_V133_FONTOS.txt

NEXUS v133 Render NO-INSTALL FIX

A Render log alapján a hiba npm install hálózati timeout volt:
ETIMEDOUT ... hasown-2.0.3.tgz

Ezért ez a verzió nem igényel npm csomag letöltést.

Render Settings:
Build command:
node -e "console.log('NEXUS v133: build skipped, no npm install')"

Start command:
node backend/index.js

Node:
20.x

Ha Render továbbra is npm install-t futtat, akkor a Render Settings-ben régi Build Command maradt beállítva. Írd át kézzel a fenti Build commandra, majd Manual Deploy / Clear build cache & deploy.


# FILE: RENDER_V134_STANDARD_SETUP.txt

NEXUS v134 - Render standard beallitas

Build command: npm run build
Start command: npm start
Node: 20.x

Ne hasznald build commandkent: npm install
Ne hasznald start commandkent: node backend/index.js

Deploy utan teszt:
/api/health
/api/venues/debug


# FILE: RENDER_V135_FONTOS.txt

NEXUS v135 - RENDER UNIVERSAL NO EXPRESS SAVE FIX

Render beallitas:
Build command: npm run build
Start command: npm start
Node: 20.x

Fontos:
- Ez a verzio nem hasznal express-t.
- Nincs kulso npm dependency.
- Nem kell npm install build command.
- A package.json es backend/index.js felul kell irja a regi fajlokat.
- Deploy utan: Manual Deploy -> Clear build cache & deploy.

Endpointok:
/api/health
/api/venues/save
/api/venues/test
/api/venues/debug
/api/state


# FILE: RENDER_V138_FONTOS.txt

NEXUS v138 - FROM YOUR ZIP / FULL PANELS / MINIMAL RENDER FIX

Az általad küldött projektből készült, a frontend panelek megtartásával.

Render beállítás:
Build command: npm run build
Start command: npm start
Utána: Manual Deploy -> Clear build cache & deploy

Fontos GitHubon:
A zip TARTALMÁT tedd a repo főkönyvtárába, ne külön nexus almappába.


# FILE: UI_RESTORE_v85.txt

NEXUS v85 UI Restore

Mi van ebben a csomagban:
- a klasszikus NEXUS felület visszaállítva (frontend a korábbi teljes dashboard vonalból)
- Render deployhoz render.yaml hozzáadva
- Supabase / persistence env minta megtartva

Használat:
1. Töröld a repo jelenlegi fájljait, vagy egy új branch/repo fölé töltsd fel ezt.
2. Ügyelj rá, hogy a gyökérben legyen a backend/, frontend/, model/ mappa.
3. Renderen:
   - Build Command: npm install
   - Start Command: node backend/index.js
   - Root Directory: üresen hagyni
4. Environment változók:
   - PORT = 10000 (nem kötelező, Render adja)
   - TRADING_MODE = paper
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   - opcionálisan exchange kulcsok

Megjegyzés:
Ez a csomag elsődlegesen a régi UI visszaállítására készült.


# FILE: UPGRADE_NOTES_v19.txt

This v19 package extends v18 with:
- venue-specific max exposure
- venue-specific fee model
- partial fill tracking scaffold
- arbitrage hedge-leg execution scaffold
- private WebSocket order stream scaffold per venue

Important:
Private venue-authenticated WebSocket streams are included as scaffolding/normalizers.
They still need real API-auth handshake wiring before production use.


# FILE: V100_NOTES.txt

NEXUS v100

Included baseline:
- audit log flow
- position sync layer
- emergency risk guard
- real execution engine base

This package is built from the latest v99 bundle with internal version bump and packaging cleanup for v100 release.


# FILE: V125_NOTES.txt

NEXUS v125 – FULL AUTO AI TRADING ENGINE

Fő újdonságok:
- Auto AI trader döntési kör megerősítve: market adat → AI jel → execution útvonal → paper fallback / real-ready.
- Tanulási állapot hozzáadva: döntések száma, trade-ek száma, winrate becslés, kumulatív paper PnL, utolsó reward.
- Adaptív confidence küszöb: vesztes paper trade után óvatosabb, nyereséges után enyhén rugalmasabb.
- Max auto order méret és min confidence állítható a UI-ban.
- Real order lock oka látható: stage, DRY_RUN, REAL_TRADING_ENABLED, auth, balance.
- Manuális execution panel debug/fallback rész lett, alapból összecsukva.

Biztonsági logika:
- Valós order csak akkor engedélyezett, ha stage=live, DRY_RUN=false, REAL_TRADING_ENABLED=true, auth OK és balance OK.
- Minden más esetben paper fallback fut, így a bot tud dönteni és tanulni valódi piaci adatból, de nem küld élő ordert.

Használat:
1. Deploy után hard reload.
2. Binance panel: éles futures kulcshoz Tesztkörnyezet pipa KI.
3. Mentés → Teszt → Kapcsolat / market proof Frissítés.
4. Indítás.
5. Auto AI trader panelen nézd: Utolsó döntés, Confidence, Paper trade-ek, Tanulási PnL.


# FILE: V126_NOTES.txt

NEXUS v126 – clean Render + Binance + Auto AI stable build

Ez a build tiszta, minimális backenddel készült, hogy Renderen ne akadjon meg az npm install.
- Külső trading lib nincs: Binance proof/test/order natív REST-tel működik.
- Supabase natív REST API-n keresztül ment, nincs @supabase/supabase-js dependency.
- Auto AI trader paper fallback működik, valós order zárolva marad DRY_RUN=true mellett.
- Render Build Command: npm install --omit=dev --no-audit --no-fund
- Render Start Command: node backend/index.js


# FILE: V126_RENDER_FIX_NOTES.txt

NEXUS v126 Render hard fix

Javítások:
- backend crash fix: maskSecret hozzáadva
- backend crash fix: realExecutionEngine import hozzáadva
- venue kártya selector javítva: data-venue-card
- apiSecret / secret mezőnév mismatch javítva
- Teszt gomb endpoint javítva: /api/venues/test/:venue
- mentés válasz és UI frissítés javítva
- frontend nem tölti vissza plain text kulcsokat, csak maszkolt placeholdert mutat
- Supabase system_state venue_configs továbbra is a meglévő schema szerint működik

Render:
- Root Directory: nexus vagy a kicsomagolt mappa gyökere
- Build Command: npm install
- Start Command: npm start
- PORT-ot Render adja.


# FILE: V127_RENDER_STABLE_NOTES_HU.txt

NEXUS v127 FULL RENDER STABLE

Javítások:
- package-lock.json eltávolítva, mert belső registry URL-eket tartalmazott és Renderen npm install hibát okozhatott.
- Node fix: .node-version + .nvmrc + render.yaml NODE_VERSION = 20.20.2.
- Render build command stabilizálva.
- ccxt optionalDependency lett, hogy a szerver akkor is elinduljon, ha ccxt telepítés gond van.
- /api/venues/save és /api/venues/test kompatibilitási endpointok hozzáadva.
- dotenv + cors bekötve.

Render:
Build command: npm install --omit=dev --legacy-peer-deps --no-audit --no-fund --package-lock=false && npm run build
Start command: npm start
Node: 20.20.2


# FILE: V128_SAVE_STABLE_NOTES.txt

NEXUS v128 SAVE STABLE
- Render továbbra is külső npm dependency nélkül indul.
- Javítva: /api/venues/config GET már config mezőt is visszaad, ezt várja a frontend.
- Javítva: mentés után hasCredentials/connected visszajelzés.
- Javítva: secret/apiSecret kompatibilitás.
- Javítva: Supabase REST alapú mentés package nélkül, ha SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY be van állítva.
- Javítva: törlés tényleg törli a kulcsokat a mentett állapotból.


# FILE: V130_PAYLOAD_FIX_NOTES.txt

NEXUS v130 PAYLOAD FIX

- Render stabil, továbbra sincs külső npm dependency.
- Frontend mentés küldi: apiKey/apiSecret és api_key/api_secret.
- Backend elfogadja: apiKey, apiSecret, secret, secretKey, api_key, api_secret.
- /api/venues/save és /api/venues/config is működik.
- /api/venues/debug ellenőrző endpoint hozzáadva.
- Supabase schema tartalmazza a venue_configs táblát.

Render:
Build command: npm install
Start command: npm start
Node: 20.x


# FILE: V140_REAL_EXCHANGE_CONNECTION_NOTES_HU.txt

NEXUS v140 REAL EXCHANGE CONNECTION

Alap: v139 FULL PANEL RESTORE.

Javítások / újdonságok:
- Minden meglévő panel és frontend fájl megtartva.
- Render beállítás marad: build = npm run build, start = npm start.
- Binance public ticker + read-only account/balance auth teszt.
- OKX public ticker + read-only account/balance auth teszt, passphrase támogatással.
- Bybit public ticker + read-only wallet-balance auth teszt.
- Kraken public ticker proof.
- Éles order továbbra NINCS bekapcsolva: DRY_RUN / paper-safe marad.

Fontos Render után:
Manual Deploy -> Clear build cache & deploy.


# FILE: V141_REAL_CONNECTION_FIX_NOTES.txt

NEXUS v141 REAL CONNECTION FIX

Alap: a feltöltött teljes projekt zipje, panelstruktúra megtartva.

Javítások:
- Nem lett resetelve a frontend, minden meglévő panel megmarad.
- /api/venues/test/:venue és /api/venues/test egyaránt működik.
- /api/connection/proof valódi public ticker hívást próbál:
  Binance, OKX, Bybit, Kraken.
- Binance / OKX / Bybit safe auth + balance check bekerült.
- Kraken jelenleg public ticker proof, private balance későbbi kör.
- Éles order nincs bekapcsolva, DRY_RUN/paper-safe marad.
- Teszt gomb UI-ban balance/status szöveget ad vissza.
- package-lock.json eltávolítva, Render build marad npm run build.

Render:
Build command: npm run build
Start command: npm start
Manual Deploy -> Clear build cache & deploy


# FILE: V143_FINAL_DATA_BIND_FIX_NOTES.txt

v143 FINAL DATA BIND FIX
- Megtartja a teljes paneles UI-t.
- /api/venues/test és /api/venues/test/:venue egységes választ ad.
- A Test gomb eredménye JSON-ként megjelenik a venue kártyán.
- Balance/auth/ticker állapot látszik.
- package-lock.json eltávolítva.
Render: Build npm run build, Start npm start.


# FILE: test.txt

hi


# V166 AUTONOMOUS AI OPERATOR
- Autonomous observe/analyze/decide/execute/evaluate/adapt cycle
- Paper-safe autonomous operation loop
- Autonomous safety downgrade and objective/adaptation state
- New API: /api/autonomous/status, /tick, /start, /stop
- New UI panel: Autonomous AI Operator
