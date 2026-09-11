/**
 * Sestavení lokálního náhledu.
 *
 * Bere přeložený kód ze `spfx/lib` (vzniká příkazem `npm run test` nebo
 * `heft build`) a zabalí ho do jednoho souboru pro prohlížeč.
 */

const path = require('path');
const spfx = path.resolve(__dirname, '..', 'spfx');

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  entry: path.resolve(__dirname, 'nahled.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'nahled.js',
    assetModuleFilename: 'assets/[name][ext]',
    clean: true
  },
  resolve: {
    extensions: ['.js', '.json'],
    // Knihovny (React, Fluent UI) jsou nainstalované u projektu SPFx.
    modules: [path.resolve(spfx, 'node_modules'), 'node_modules']
  },
  module: {
    rules: [
      {
        test: /\.png$/i,
        type: 'asset/resource'
      }
    ]
  },
  performance: {
    // Fluent UI je velká knihovna; u lokálního náhledu na velikosti nezáleží.
    hints: false
  },
  stats: 'errors-warnings'
};
