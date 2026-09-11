const spfxProfile = require('@microsoft/eslint-config-spfx/lib/flat-profiles/react');

module.exports = [
  ...spfxProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    },
    rules: {
      // Hlavní komponenta stránky patří na začátek souboru, pomocné komponenty
      // a styly pod ni — jinak se soubor čte odzadu. Vyhodnocují se až při
      // vykreslení, takže o skutečné použití před definicí nejde.
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: false, classes: false, variables: false, typedefs: false }
      ],
      // SharePoint REST vrací u nevyplněných sloupců `null`, ne `undefined`.
      // Formátovací funkce musí obojí přijmout, jinak by aplikace padala
      // na prázdných hodnotách.
      '@rushstack/no-new-null': 'off'
    }
  }
];
