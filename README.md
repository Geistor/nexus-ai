# NEXUS AI v199_187_18 — DigitalOcean PostgreSQL

Kiindulás: **v199_187_16**. A `server.js` adatbázis-műveletei választhatóan közvetlen PostgreSQL-kapcsolaton mennek. A Paper szabályok, a kereskedési felület, a stratégiai verzió, valamint a valós megbízások meglévő tiltása változatlan. A korábbi Supabase útvonal továbbra is választható (`NEXUS_DB_PROVIDER=supabase` vagy változó nélkül). Az eredeti **100 pont** változatlan azonosítókkal a `REQUIREMENTS_MATRIX_1_100.md` fájlban van. Ez a kiadás az adatkapcsolat átállítása, nem a 100 pontos program lezárása.

## V18: saját forward eredmények romlásfigyelése

- Azonos kísérlethez és konfigurációhoz tartozó, ellenőrzött lezárt ügyletekből 10/30/60/120 elemű ablakok.
- Tőzsde és route szerinti elkülönítés; 10 veszteséges eredmény figyelmeztetés, legalább 30 eredmény és negatív nettó expectancy + PF < 0,9 kockázatemelési tiltás.
- A korábbi globális automatikus retirement küszöbe megmarad. A route-szintű tiltás akkor is hat, ha az összesített múlt pozitív.
- A decay állapot, ablakmetrikák és a szomszédos 30-as ablakok összehasonlítása a registry-ben és a checksumos tanulási mentésben tárolódik. A standardizedDrop diagnosztika, nem kalibrált szignifikanciateszt.
- A `/api/models/registry` a meglévő megfigyelési API; `entries[].prospectiveEvidence.decay`, `venueDecay`, `routeDecay`.
- Nem szükséges új adatbázis-migráció. A PostgreSQL-beállítások és a felület elrendezése megmaradnak.
- GitHub Actions: Node 20 és 24 ellenőrzés, regresszió és izolált indítás/újraindítás. Munkahelyről az Actions fülön, telepítés nélkül követhető. Ez nem élő adatbázis- vagy tőzsdei próba.

## Átállás DigitalOceanra

1. Hagyd archiválva az alkalmazást. Tartsd meg a Supabase-forrást, a mentést és a korábbi alkalmazásbeállításokat. Az átállás előtt a pgAdminban a DigitalOcean `nexus` adatbázisban a meglévő 21 tábla és az ismert 4 828 naplóbejegyzés legyen elérhető.
2. A DigitalOcean `nexus-postgres` klaszterén hozz létre egy külön PostgreSQL-bejelentkezést `nexus_app` néven. A pgAdminban a **DigitalOcean – cél / nexus** adatbázishoz tulajdonosként (`doadmin`) csatlakozz. Az `infra/supabase_tools.sql` fájlból **csak** a `BEGIN NEXUS DIGITALOCEAN POSTGRES MIGRATION` és `END NEXUS DIGITALOCEAN POSTGRES MIGRATION` jelölők közötti részt futtasd. **Ne futtasd a teljes régi Supabase SQL-fájlt.** Ugyanezt a külön blokkot a csomag könyvtárából az `npm run --silent postgres:sql` kiírja. Az átállási SQL tranzakcióban hozza létre a tanulási és végrehajtási állapot hiányzó tábláit és függvényeit, és hozzáférést ad a futtató felhasználónak. Nem futtat karbantartást és nem törli a másolt rekordokat.
3. Első körben próbáld ki a meglévő adatbázist az alkalmazás indítása nélkül. Node 20 alatt futtasd az `npm ci` parancsot, állítsd be az alábbi változókat a tesztkörnyezetben, majd futtasd az `npm run postgres:check` parancsot. Ez csak olvas: ellenőrzi a TLS-t, a táblákat és a függvényjogokat, majd kiírja a kereskedési napló rekordszámát.
4. Ha a próba sikeres, az App Platformon állítsd be ugyanezeket a változókat. A kapcsolati URL legyen titkos változó. A **Trusted Sources** engedélyezze a NEXUS alkalmazást vagy az alkalmazás tényleges kimenő címét; a saját géped engedélye önmagában nem elég. Egy alkalmazáspéldány, első futtatási parancs: `npm run postgres:check && npm start`. Csak ezzel a verzióval és a PostgreSQL-beállításokkal állítsd vissza az archivált alkalmazást.
5. A felületen maradj **Paper** módban. Ellenőrizd a történeti naplót és az adatbázis státuszát (`/api/database/health`). Indíts kézzel egy Paper próbát, állítsd le, majd indítsd újra az alkalmazást. Ellenőrizd, hogy az új napló és a tanulási állapot is visszatöltődött, és a program nem váltott külső megbízásokra. Karbantartást és automatikus újraindulást csak ezután kapcsolj vissza, ha szükséges.

| Változó | Első telepítés |
|---|---|
| `NEXUS_DB_PROVIDER` | `postgres` |
| `NEXUS_POSTGRES_URL` | `postgresql://nexus_app:<URL-kódolt-jelszó>@<DigitalOcean-DNS-host>:25060/nexus` — a végéről hagyd el a `?sslmode=…` és egyéb paramétereket. |
| `NEXUS_POSTGRES_CA` | A klaszter CA-fájljának teljes PEM-tartalma (`BEGIN CERTIFICATE` és `END CERTIFICATE` sorokkal); több sor vagy literális `\n` is megadható. |
| `NEXUS_DEFAULT_MODE` | `paper` |
| `NEXUS_ALLOW_LIVE`, `NEXUS_LIVE_REAL_SUBMIT`, `NEXUS_TESTNET_REAL_SUBMIT` | Mindhárom `false` |
| `NEXUS_AUTONOMOUS_ALWAYS_ON`, `NEXUS_CONTINUOUS_AUTONOMY` | Mindkettő `false` az első próbához |
| `NEXUS_DB_MAINTENANCE` | `false` |
| `NEXUS_RECOVERY_AUTOSTART_AFTER_RESTART` | `false` |
| `NEXUS_SAFE_STAGING_AUTO_RESUME` | `false` |
| `NEXUS_STARTUP_AUTO_RESUME_AFTER_AUTOPROOF` | `false` |

A CA és a DNS-host ellenőrzése kötelező. Ne írd be a valódi jelszót a repóba vagy a ZIP-be. Ha a meglévő tőzsdei beállítások titkosításához korábban külön kulcsot állítottál be, ugyanazt a titkos értéket tartsd meg az alkalmazásban. A régi `SUPABASE_` változók nem irányítják a PostgreSQL-adatkapcsolatot; az opcionális Supabase Storage modellarchívum külön szolgáltatás, amelyhez a korábbi beállításai még szükségesek, ha használtad.

Visszaállás: a Paper futást állítsd le, készíts mentést a DigitalOceanon keletkezett új adatokról, majd csak ezután válts vissza az előző kódra és a korábbi Supabase-konfigurációra. Az átállás után keletkezett sorok nem szinkronizálódnak automatikusan visszafelé.

---

# NEXUS AI v199_187_16

Köztes működő paper-stratégia kiadás; a teljes100 pontos projekt még nincs befejezve.39 KÉSZ/55 RÉSZLEGES/4 HIÁNYZIK/2 BLOKKOLT. Node20, `npm ci`, `npm start` → server.js. PAPER default; LIVE/real testnet submit tiltva; egy replica.

Telepítés, időbélyeges videóaudit, tényleges ellenőrzések, rollback és külső acceptance: PROJECT_DOCUMENTATION.md. Az eredeti100 sor: REQUIREMENTS_MATRIX_1_100.md. A rejtett `.github/workflows/nexus-ci.yml` is része a100 fájlos ZIP-nek.

# NEXUS AI v199_187_15 – köztes kiadás

Kiinduló GitHub main: `fa3746daf745f51d8787bb4b9ed4678b436303e0` (v14). A teljes NEXUS még nem tekinthető befejezettnek. Az eredeti 100 pont továbbra is hatókörben: **43 kész, 47 részben kész, 8 hiányzik, 2 külső feltétel**. A kész státusz implementációs körre vonatkozik, nem nyereségességi vagy üzemi minősítés.

V15 változások:
- Az új candidate és revalidation trial saját `experimentId` + `configFingerprint` + artefaktum alapján gyűjt forward eredményt. A megbízás immutable contractja és a trade journal megőrzi ezeket. Másik, azonos artefaktumú kísérlet, szintetikus vagy jövőbeli eredmény nem számíthat saját forward mintának. A v13/v14 legacy sizing modellek olvasási kompatibilitása megmaradt; új trial nem örökli ezek eredményét.
- Checkpoint v2: teljes payload checksum, aktív order/partial lifecycle és venue capital. Lezárt pozíció nem nyílhat újra; visszatöltött külső bizonytalan order új submit helyett reconciliationt igényel. V1 checkpoint továbbra is betölthető, checksum nélküli legacy bizonyítéki szinttel.
- Szigorú remote registry olvasás: hálózati hiba nem üres tábla. Ugyanazon registry-revízió eltérő configja explicit konfliktus. Hibás bundle és hiányzó worker-válasz nem némítható el.
- Valódi új entry/exit döntéseket számoló, workerben futó quote replay: momentum, breakout, mean-reversion; 9 rögzített változat; train-only választás, időben elkülönített validation/test, 60 s embargo, kétoldali díj/slippage, lot/minNotional, nyitott pozíció külön kimutatva. Ez shadow kutatási eredmény, nem végrehajtási vagy profitbizonyíték; a runtime továbbra is a meglévő belépés/kilépés szabályokat használja.
- A GitHub mainből hiányzó `.github/workflows/nexus-ci.yml` ismét része a csomagnak. A tényleges GitHub Actions futás még nem igazolt.

Ellenőrzés: Node 20; **145/145 teszt PASS**, szintaxisellenőrzés és 18 endpointos offline smoke, beleértve az új replay POST-ot. A végleges kiadás tiszta kibontásának eredménye a PROJECT_DOCUMENTATION.md-ben. Élő Railway/testnet/nyereségességi igazolás nincs.

Új diagnosztika: `GET /api/strategy/counterfactual`; `POST /api/strategy/counterfactual` opcionális `{"venue":"binance","symbol":"BTC/USDT"}` body. Csak a futás saját, nyilvános, megfelelő forrású tick-historyját olvassa. Legalább90 quote és mindkét holdoutban legalább20 embargo utáni quote kell. Üres adatra explicit skipped válasz; nincs szintetikus pótlás. Egyszerre egy replay, legfeljebb4000 quote, 10 s/128 MiB worker-korlát.

Telepítés: lásd RAILWAY_SETUP.md. Új SQL-migráció v15-ben nincs; a v13 izolált migráció továbbra is előfeltétel a remote model/authority mentéshez. A teljes történeti SQL-toolboxot ne futtasd.

Az alábbi korábbi v14 dokumentáció történeti referencia; az aktuális állapotot a fenti v15 rész határozza meg.

# NEXUS AI v199_187_14

A v13 javításaira épülő forward policy/search/risk kiadás. A csatolt nexus.zip egy régebbi 0.9.3 alap volt, ezért a frissebb implementációt őriztük meg. Kiinduló GitHub main: `1189f26c5d1aad256cc244e1e5d608569f988a2a` (v199_187_12). Stratégiaepoch: `v199_187-adaptive-exit-ai-core`, változatlan.

- Hat train-only paraméterváltozat; ténylegesen alkalmazott family-wise Hoeffding korrekció a korlátozott objective-on; train alapján kiválasztott befagyasztott nyertes, külön validation/test és új forward kísérlet.
- Közös Registry/venue/route/mode promotion policy: más venue vagy shadow pozitív eredménye nem ad risk boostot.
- Retired modell auditált, idempotens új paper próbája: POST /api/models/revalidation. Régi performance nem öröklődik.
- Saját public return-bucket korreláció és globális kockázat, legalább 50 mintára képes 200 soros compounding ablak; külön megnyitható modell/validáció/risk UI.
- Public REST depth snapshot adapter Binance/Bybit/OKX/Kraken spothoz; perp funding Binance/Bybit/OKX. Snapshot és WS-delta folytonosság külön; spot funding N/A, null perp funding nem nulla költség. Üzemi feed proof még kell.
- Train-only candidate, purge/embargo, külön validation/test és befagyasztott méretezési replay; historical/synthetic eredmény nem új candidate kereskedési bizonyítéka.
- Saját forward minta nélkül nincs champion risk boost. A gyenge kísérlet tovább gyűjthet apró paper mintát; a kijelölt experiment stabil marad.
- Teljes registry, artefaktum, előzmény és konfiguráció checksum/CAS mentése; stale helyi cache kezelése.
- Immutable execution contract, tartós idempotencia, atomikus lease/fencing, clientOrderId és reconciliation; bizonytalan order nem vak újraküldés.
- Supabase `sleep is not defined` retry hiba javítva; tényleges SVG Strategy Graph; portfólió- és equity guard.
- Valódi `.github/workflows/nexus-ci.yml` és reprodukálható `package-lock.json`.

Node 20.x szükséges. Helyi ellenőrzés:

```bash
npm ci --ignore-scripts
npm run check
npm run release:test
npm run test:smoke
```

Indítás: `npm start`. Biztonságos alap: PAPER, LIVE tiltva, egy aktív Railway trading replica. A böngésző megnyitása nem indítási feltétel. A smoke teszt letilt minden külső hálózatot, nem használ valódi credentialt vagy adatbázist.

Telepítés előtt az `infra/supabase_tools.sql` **kizárólag v199_187_13 BEGIN/END közötti új szakaszát** olvasd és futtasd a megfelelő Supabase projectben; a teljes történeti SQL-toolbox nem automatikus migráció. Lásd RAILWAY_SETUP.md.

Részletes változásjegyzék, videó időbélyegei, tesztek, jelenlegi/célarchitektúra és korlátok: PROJECT_DOCUMENTATION.md. Minden eredeti követelmény állapota: REQUIREMENTS_MATRIX_1_100.md. Telepítés/migráció/rollback: RAILWAY_SETUP.md.

A Helyi eredmény: Node20 alatt 137/137 teszt, check és offline smoke PASS. GitHub Actions szolgáltatói futása, Railway Wait for CI és v14 production restore/testnet/stability még nem igazolt. A ZIP nem módosította a GitHub main vagy a futó Railway alkalmazás állapotát. A teljes 100 pontos cél további munkát igényel; a search korlátozott sizing policy, nem új belépési stratégia vagy automatikusan profitáló modell.

## v199_187_17 ellenőrzés

- Helyi PostgreSQL 17, TLS és elkülönített futtató felhasználó: 4 828 tesztrekord beolvasása; a három kritikus táblán írás, visszaolvasás és tesztsor törlése; tanulási állapot mentése és visszaolvasása új kapcsolaton; alkalmazás indítása és újraindítása; LIVE megbízási tiltás.
- A valós DigitalOcean példányhoz és a tőzsdékhez ez a próba nem csatlakozott. Az éles környezethez szükséges kapcsolatot a `postgres:check` és a fenti Paper-próba igazolja.
