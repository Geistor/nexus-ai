NEXUS v177.1 – Render Fix + Learning Feedback SAFE MERGE

Javítás:
- az előző v177ok server.js nem indított HTTP szervert, ezért Render kilépett.
- ez a verzió valódi http szervert indít és életben marad.

Felülírható fájlok:
- server.js
- package.json
- backend/index.js
- frontend/app.js
- frontend/index.html
- frontend/styles.css

Render:
Build command: npm run build
Start command: npm start
