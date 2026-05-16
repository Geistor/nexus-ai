NEXUS v177.2 – Render Port Fix

Javított hiba:
- EADDRINUSE: address already in use :::10000
- A backend/index.js már elindította a szervert.
- A régi server.js ezután még egyszer indított szervert ugyanazon a PORT-on.

Ez a patch:
- megtartja a meglévő backend szervert
- nem indít második listener-t
- fallback szervert csak akkor indít, ha backend/index.js betöltése hibára fut

Render:
Build command: npm run build
Start command: npm start
