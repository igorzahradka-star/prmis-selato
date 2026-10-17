/**
 * Malý lokální server pro náhled.
 *
 * Proč: moderní prohlížeče u souborů otevřených přes `file://` blokují
 * načítání skriptů a obrázků. Náhled proto potřebuje běžet přes adresu
 * `http://localhost`.
 *
 * Použití (ze složky `nahled`):
 *   node serve.js
 * Pak otevři http://localhost:4322 a server ukonči klávesami Ctrl+C.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4322;
const ROOT = path.resolve(__dirname, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8'
};

http
  .createServer((req, res) => {
    const requested = decodeURIComponent((req.url || '/').split('?')[0]);
    const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
    const file = path.resolve(ROOT, relative);

    // Server nesmí vydat nic mimo složku dist.
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Zakázáno');
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Soubor nenalezen: ' + relative);
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        // Bez tohohle prohlížeč po přestavění náhledu klidně ukáže starou
        // verzi z cache — soubor se pořád jmenuje stejně (nahled.js).
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`Náhled PRMIS SELATO běží na http://localhost:${PORT}`);
    console.log('Ukončíš ho klávesami Ctrl+C.');
  });
