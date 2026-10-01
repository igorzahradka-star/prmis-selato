import * as fs from 'fs';
import * as path from 'path';

import { APP_VERSION } from './version';

describe('verze aplikace', () => {
  it('shoduje se s verzí v package-solution.json (jinak by patička ukazovala jinou verzi než balíček)', () => {
    // Testy běží z lib-commonjs, proto se hledá nahoru od aktuální složky.
    let dir = __dirname;
    let file: string | undefined;
    for (let i = 0; i < 6 && !file; i++) {
      const candidate = path.join(dir, 'config', 'package-solution.json');
      if (fs.existsSync(candidate)) {
        file = candidate;
      }
      dir = path.dirname(dir);
    }
    expect(file).toBeDefined();
    const solution = JSON.parse(fs.readFileSync(file as string, 'utf8')) as { solution: { version: string } };
    expect(APP_VERSION).toBe(solution.solution.version);
  });
});
