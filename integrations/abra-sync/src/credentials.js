/** Načtení přihlašovacích údajů z klávesnice za běhu (heslo se nezobrazuje, nikam se neukládá). */

import { createInterface } from 'node:readline';

export function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

/** Načte heslo bez zobrazování znaků. */
export function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      throw new Error('Heslo se zadává jen z klávesnice v okně příkazové řádky.');
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') {
          process.exit(1);
        }
        if (c === '\u007f' || c === '\b') {
          value = value.slice(0, -1);
        } else {
          value += c;
        }
      }
    };
    stdin.on('data', onData);
  });
}
