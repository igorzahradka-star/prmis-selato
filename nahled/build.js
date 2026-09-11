/**
 * Sestaví lokální náhled.
 *
 * Spouští webpack přes jeho programové rozhraní, aby nebylo nutné
 * instalovat další balíček `webpack-cli` jen kvůli náhledu.
 *
 * Použití (ze složky `nahled`):
 *   node build.js
 */

const fs = require('fs');
const path = require('path');
const webpack = require(path.resolve(__dirname, '..', 'spfx', 'node_modules', 'webpack'));
const config = require('./webpack.config');

webpack(config, (err, stats) => {
  if (err) {
    console.error('Náhled se nepodařilo sestavit:', err.message);
    process.exit(1);
  }

  console.log(stats.toString({ colors: false, errors: true, warnings: true, modules: false }));
  if (stats.hasErrors()) {
    process.exit(1);
  }

  // Stránku zkopírujeme k výsledku, aby šel náhled otevřít jedním souborem.
  const target = path.resolve(__dirname, 'dist', 'index.html');
  fs.copyFileSync(path.resolve(__dirname, 'index.html'), target);

  console.log(`\nHotovo. Otevři v prohlížeči:\n  ${target}`);
});
