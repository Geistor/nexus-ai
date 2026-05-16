NEXUS v175.1 – Cross-Market Render Fix SAFE MERGE PATCH

Javítás:
- az előző v175 patch csak console.log-ot futtatott, ezért Renderen az app kilépett.
- ez a patch visszarakja a stabil server.js entrypointot.
- npm start -> node server.js
- ha backend/index.js működik, azt tölti be.
- ha backend/index.js hibás, fallback szerver indul, így Render nem lép ki.

Felülírható fájlok:
- server.js
- package.json
- backend/index.js
- frontend/app.js
- frontend/index.html
- frontend/styles.css

Új v175 funkció:
- Cross-Market Intelligence panel
- /api/cross-market/status
- correlation matrix
- dominance
- capital flow
- global context AI

Render:
Build command: npm run build
Start command: npm start
