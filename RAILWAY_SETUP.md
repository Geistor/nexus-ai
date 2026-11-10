# V15 telepítési kiegészítés

A v14 forráskészletet a teljes v15 csomaggal cseréld. A GitHub webes feltöltésnél a rejtett `.github/workflows/nexus-ci.yml` fájlra külön figyelj: a main v14 commitban nem szerepelt, bár az átadott ZIP-ben igen. GitHub Actions sikeres futását és a Railway Wait for CI beállítását a szolgáltatóban kell ellenőrizni; ez ebben a munkában nem történt meg.

Továbbra is egy trading replica, PAPER alapértelmezés, LIVE real submit tiltva. V15 nem aktivál fizetős service-t, pénzmozgást vagy live ordert. Új env és új SQL nem kell. A meglévő v13 migrációt csak annak BEGIN/END szakaszából, áttekintve alkalmazd, ha még hiányzik.

Checkpoint schema2 checksumot, aktív ordereket és venue capitalt ad. V1 továbbra is legacyként fogadható el. Külső visszatöltött pending order `RESTART_RECONCILIATION_REQUIRED` állapota újraküldést blokkol; testnet sync/cancel/állapotellenőrzés és aktuális authority lookup kell a rendezéshez. A teljes automatikus testnet reconciliation drill még fennmaradó feladat.

Friss telepítés után ellenőrizendő: model durability remote állapot; saját experiment/config tag az új paper journal sorokon; újraindítás után azonos candidate/experiment és nyitott részpozíció; a weboldal megnyitása nélkül növekvő runtime cycle. Hibás checksum vagy config-conflict mellett előbb össze kell vetni a két mentést, nem vakon felülírni.

Rollback: őrizd meg a telepítés előtti adatbázis- és helyi mentést. A v14 schema1 checkpointot használ; a v15 schema2 állapot visszaléptetését elkülönítve ellenőrizd. A v15 új journal mezőit ne töröld. Azonos config-konfliktust a v14 nem ugyanilyen szigorúan kezel; diagnosztikai konfliktus esetén az adatmentés vizsgálata legyen az első lépés.

Az alábbi v14 útmutató a változatlan szolgáltatói beállításokat tartalmazza.

# NEXUS v199_187_14 – telepítés, migráció és rollback

## Megőrzött Railway alap

Source: GitHub `Geistor/nexus-ai`, `main`. Node20.x, build `npm run build`, start `npm start`, Healthcheck path: `/healthz`, timeout300s. Serverless: OFF; **egy aktív trading replica** (Replicas: 1). A `PORT` értékét Railway injektálja. A jelenlegi szolgáltatói beállításokat nem módosítottuk és nem ellenőriztük új v14 futáson.

A meglévő `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` és `VENUE_CONFIG_ENCRYPTION_KEY` maradjon változatlan. A service-role kulcs kizárólag szerveroldali titok. Meglévő venue credential forrás/sorrend megmarad; kulcsot ne commitolj. Binance passphrase üres; OKX esetén kell. Mentett read-only kulcs nem trade jogosultság.

```text
NEXUS_DEFAULT_MODE=paper
NEXUS_ALLOW_LIVE=false
NEXUS_LIVE_REAL_SUBMIT=false
NEXUS_TESTNET_REAL_SUBMIT=false
NEXUS_AUTONOMOUS_ALWAYS_ON=true
NEXUS_CONTINUOUS_AUTONOMY=true
NEXUS_RECOVERY_AUTOSTART_AFTER_RESTART=true
NEXUS_SAFE_STAGING_AUTO_RESUME=true
NEXUS_CONTINUITY_CHECKPOINT_INTERVAL_MS=60000
NEXUS_RETRAIN_MIN_INTERVAL_MS=1800000
NEXUS_RETRAIN_TICK_MS=900000
NEXUS_RETRAIN_MIN_TRADES=20
```

`SAFE_STAGING_AUTO_RESUME` kizárólag már engedélyezett safe helyi mód folytatása; nem real submit engedély. Új környezet PAPER-ből indul. A retrain worker 4000sor/10s/128MiB és MC max400 iteráció; a kisebb konfigurált mintavétel/iteration megmaradhat. Külön GPU/standby/replica nem szükséges és nem aktivált.

## Kiadás és CI

1. Mentsd a jelenlegi deploy azonosítóját, beállításait, venue titkosítási kulcsát és teljes Supabase backupot. A backup valódi visszaállíthatóságát külön környezetben ellenőrizd.
2. A ZIP teljes tartalmát másold a projektbe, a `.github/workflows/nexus-ci.yml` és `package-lock.json` fájlokkal együtt. Ne másolj `storage`, credential, `.git` vagy `node_modules` könyvtárat másik gépről.
3. Node20 alatt `npm ci --ignore-scripts`, `npm run check`, `npm run release:test`, `npm run test:smoke`. A CI pontosan ezt futtatja push/PR/manual triggerre. A helyi eredmény nem GitHub Actions futásigazolás.
4. A workflow mainre kerülése után ellenőrizd a valódi Actions eredményt. Railway-en a deploy előtti **Wait for CI / szükséges CI checks** beállítást külön kapcsold be és ellenőrizd; jelenleg ez nem igazolt. Ellenőrizd, hogy sikertelen CI esetén a deploy valóban nem indul. Külön Railway staging fizetős service nem készült.

## Additív v3 Supabase migráció

Fájl: `infra/supabase_tools.sql`. **Csak** a `-- BEGIN v199_187_13 isolated learning-state + execution-authority migration` és a megfelelő `-- END v199_187_13` jelölés közötti részt használd. Ne futtasd a teljes történeti toolboxot: régi javító/karbantartó SQL-eket is tartalmaz.

Az új rész két táblát hoz létre (`nexus_learning_state`, `nexus_execution_state`) és két RPC-t (`nexus_save_learning_state`, `nexus_execution_authority`). A migráció additív, nem töröl meglévő trade/capital rekordot. RLS aktív, public/anon/authenticated jogosultság visszavonva, service_role kap hozzáférést; security invoker, rögzített search_path. A tényleges Supabase SQL futtatás és API schema-cache frissülés még külső feladat, itt csak izolált PostgreSQL-ben volt ellenőrizve.

Migráció nélkül a paper lokális mentés működik, a remote státusz explicit hiányos/blokkolt; **külső testnet submit durable authority nélkül tiltott**. Az első sikeres CAS mentés új remote row-t készít; a registry minden candidate/retired/champion/previous-champion artefaktumát és teljes historyját, valamint az aktív konfigurációt checksum alatt menti. A trade/capital persistence külön meglévő rendszer, nem az új registry-bundle helyettesíti.

## Deploy utáni bizonyítás

- `/healthz` mutassa v199_187_14-et. Ez csak startup proof.
- `/api/models/durability`: `saved-local-and-remote`, `remoteVerified=true` és checksum; táblában tényleges payload/revision. Ezután izolált stagingben cache nélküli redeploy: champion, previous champion, minden artefaktum/history és whitelist/risk/config egyezzen. Ne töröld production storage/DB-t tesztként.
- `/api/models/registry`: v3 revision, experimentId és forward-evidence. A legacy candidate nem kap automatikusan risk boostot. Új kísérleti paper ügyleten candidateFingerprint + candidatePolicy legyen; csak azonos venue/mode/epoch eredményét mérd.
- `/api/execution/authority`: liveRealSubmit=false. `/api/portfolio/risk-2`: saját tőke/exposure és equity guard. `/api/strategy/evolution`: search shadow-only. Strategy Builder előnézetben SVG gráf.
- Zárd be a böngészőt és később ellenőrizd a heartbeat, friss saját venue adat és actual cycle/trade változását. Többórás lag/RAM/feed/retry/persistence megfigyelés szükséges; a helyi smoke nem ezt igazolja.
- Valódi testnet vizsgálat csak külön testnet kulccsal és kifejezetten engedélyezett real-testnet körben. Receipt/orderId az acceptance bizonyítéka, nem fill/cancel/full lifecycle. LIVE továbbra is tiltott. Local fallback zöld proof nem live jogosultság.

## Konfliktusok és rollback

Újabb durable revision felülírhat elavult nemüres helyi registryt. Azonos revision/idő mellett eltérő tartalom hibát jelez és remote írást blokkol; checksum hibás bundle nem töltődik. CAS conflict után újraolvasás történik. A tanulási DB revision és a registry revision külön számláló. Több önálló trading replica továbbra sem támogatott productionban.

Rollbacknél állítsd meg biztonságosan az autopilotot, várd meg a pending order reconciliationt, majd válaszd vissza az ismert v12 deployt. Az additív v3 táblákat ne töröld. A v12 nem ismeri a v3 remote bundle-t: a visszaállítás előtt archiváld, és őrizd meg az execution ledger/clientOrderId-ket. Azonos döntést rollback után sem szabad vakon újraküldeni. A v3 cache-fájlokat (runtime által generált `storage/model_registry_v2.json`, `learning_bundle_v3.json`, `execution_ledger_v3.json`) őrizd meg; a registry-fájlnév kompatibilitás miatt v2, a tartalom v3. Korábbi model rollback csak jogosult, nem decay-retired championra lehetséges. Éles adat törlése és pénzmozgatás nem része a kiadásnak.

## Még szükséges külső feltételek

Valódi GitHub CI és Railway CI gate; Supabase v3 migráció+restore drill; új v14 többórás futás; Binance/Bybit real-testnet acceptance/fill/cancel; OKX/Kraken adapter proof; valódi L2/perp funding feed; fix kimenő IP/whitelist feltétel; opcionális külön staging. Ezek egyike sincs elvégzettként feltüntetve.

## v14 kiegészítések

A v14 ugyanazt az additív v13 SQL migrációt használja, új séma nem szükséges. A v13 táblák és runtime cache megmaradnak. A v14 mezők a checksum alatt tárolt registry payload részei: revalidationOf, saját venue/route forward metrikák és searchValidation. A már futó v13-ból rollback esetén ezek a többletmezők nem adhatnak új live jogot.

Public edge feed: `NEXUS_PUBLIC_EDGE_FEEDS=true` alapból; szükség esetén `false` kikapcsolja csak ezt a kiegészítő adatlekérést. 10s tick, max24 cache-piac, 2 párhuzamos kérés, 3s/request timeout, 15s ütemezési keret (megkezdett kérés/funding miatt legfeljebb kb21s), provider hiba után 60s backoff. A kereskedési core nem vár erre. A depth 3s freshness után hiányzó; funding60s után hiányzó. A periodikus REST nem folyamatos WS L2 stream. Új privát jogosultságot/perpetual trading terméket nem kapcsol be; külső execution továbbra is csak spot testnetet támogat és alapból tiltott. Kraken perp adatadapter nincs.

`/api/market/edge-feeds` aktuális source/status/freshness/error/privateAuthority mezőket ad. A migráció/redeploy után a valós 4 venue REST elérhetőségét és a runtime döntési inputot ellenőrizd; a fixture-teszt nem szolgáltatói feed proof. Az orderbook snapshot sequence ugrás nem WS delta gap; valódi WS delta folytonosság továbbra is külön feladat.

A modellrészletek a Fejlődés megfigyelése panel külön nyitható részében láthatók. Retired modell „Új paper értékelés” gombja vagy POST `/api/models/revalidation` JSON `{"id":"retired-model-id"}` új forward trialt nyit. Ismétlés ugyanazt az aktív trialt adja. Másik befejezetlen experiment esetén a trial várakozhat; nincs automatikus kockázati visszaengedés, új 30 saját forward sor szükséges a friss trial időhatára és embargo után.
