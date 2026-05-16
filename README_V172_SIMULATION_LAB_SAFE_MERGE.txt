NEXUS v172 – Market Simulation Lab SAFE MERGE PATCH

Ez nem minimál placeholder patch.
Az azonos nevű fájlokban benne maradt a v171 SAFE MERGE teljes kódja, és abba lett beleépítve a v172 Simulation Lab.

Tartalom:
- backend/index.js
- frontend/app.js
- frontend/index.html
- frontend/styles.css

Új API-k:
- GET /api/simulation/status
- POST /api/simulation/run
- POST /api/simulation/monte-carlo

Új UI:
- Market Simulation Lab panel
- scenario futtatás
- Monte Carlo stress test
- survival/stress/stability eredmények

Feltöltés:
1. ZIP kicsomagolása
2. fájlok felülírása GitHubon a repo gyökerében
3. Render: Clear cache + Deploy

Build: npm run build
Start: npm start
