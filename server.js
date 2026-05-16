// NEXUS v177.2 Render Port Fix
// A backend/index.js már elindítja a szervert.
// Ez NEM indít második HTTP szervert, így nincs EADDRINUSE hiba.

try {
  require("./backend/index.js");
  console.log("NEXUS v177.2: backend server loaded, no duplicate listener started.");
} catch (err) {
  console.error("NEXUS v177.2: backend failed to load:", err && err.stack ? err.stack : err);

  const http = require("http");
  const fs = require("fs");
  const path = require("path");
  const PORT = process.env.PORT || 10000;

  function send(res, code, type, body) {
    res.writeHead(code, { "Content-Type": type });
    res.end(body);
  }

  const fallback = http.createServer((req, res) => {
    if (req.url.startsWith("/api/health")) {
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        success: true,
        status: "fallback",
        version: "v177.2"
      }));
    }

    let filePath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    let file = path.join(__dirname, "frontend", filePath);

    try {
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(__dirname, "frontend", "index.html");
      }
      const ext = path.extname(file).toLowerCase();
      const type =
        ext === ".css" ? "text/css; charset=utf-8" :
        ext === ".js" ? "application/javascript; charset=utf-8" :
        "text/html; charset=utf-8";
      return send(res, 200, type, fs.readFileSync(file));
    } catch (_) {
      return send(res, 200, "text/plain; charset=utf-8", "NEXUS v177.2 fallback running");
    }
  });

  fallback.listen(PORT, () => {
    console.log("NEXUS v177.2 fallback server running on port", PORT);
  });
}
