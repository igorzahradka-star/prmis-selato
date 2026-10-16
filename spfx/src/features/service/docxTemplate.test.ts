import * as fs from 'fs';
import * as path from 'path';

import { SERVICE_CATALOG as CAT } from '../../core/serviceCatalog.data';
import { ContractInput, recomputeSiteActivities } from '../../core/serviceContract';
import { buildRenderContext, formatKc } from '../../core/serviceContractRender';
import { docxPlainText, patchTemplateXml, renderDocxTemplate } from './docxTemplate';

const dir = path.join(process.cwd(), 'test-fixtures', 'contract');
const read = (name: string): Uint8Array => new Uint8Array(fs.readFileSync(path.join(dir, name)));

describe('kc', () => {
  it('formátuje částky jako v referenčním generátoru', () => {
    expect(formatKc(952842)).toBe('952 842 Kč');
    expect(formatKc(50000)).toBe('50 000 Kč');
    expect(formatKc(0)).toBe('0 Kč');
    expect(formatKc(null)).toBe('—');
    expect(formatKc('')).toBe('—');
    expect(formatKc('abc')).toBe('abc');
    expect(formatKc(-1500)).toBe('-1 500 Kč');
  });
});

describe('úprava XML šablony (docxtpl)', () => {
  it('spojí značku rozdělenou na úseky a nahradí odstavec řádkovou značkou', () => {
    const xml = '<w:p><w:r><w:t>{%p </w:t></w:r><w:r><w:t>if volby.penale %}</w:t></w:r></w:p><w:p><w:r><w:t>Text {{ a</w:t></w:r><w:r><w:t>.b | kc }}</w:t></w:r></w:p>';
    expect(patchTemplateXml(xml)).toBe('{%if volby.penale %}<w:p><w:r><w:t>Text {{ a.b | kc }}</w:t></w:r></w:p>');
  });

  it('řádková značka tr nahradí celý řádek tabulky, chytré uvozovky se narovnají', () => {
    const xml = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{%tr for x in xs if x.a == ‘k’ %}</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>{{ x }}</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>{%tr endfor %}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    expect(patchTemplateXml(xml)).toBe("<w:tbl>{%for x in xs if x.a == 'k' %}<w:tr><w:tc><w:p><w:r><w:t>{{ x }}</w:t></w:r></w:p></w:tc></w:tr>{%endfor %}</w:tbl>");
  });
});

/** Vstup ukázkové smlouvy (priklad_vstup_smlouvy.json) jako data smlouvy; činnosti lokality se spočítají z checklistu stejně jako v referenčním generátoru. */
function exampleInput(): ContractInput {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'priklad_vstup_smlouvy.json'), 'utf8')) as ContractInput & { _poznamka?: string };
  return { ...raw, lokality: raw.lokality.map((l) => recomputeSiteActivities(CAT, l)) };
}

describe('vykreslení šablon smlouvy — shoda s ukázkou z referenčního generátoru', () => {
  const input = exampleInput();
  const rc = buildRenderContext(CAT, input);

  const diff = (got: string[], want: string[]): string[] => {
    const out: string[] = [];
    for (let i = 0; i < Math.max(got.length, want.length) && out.length < 12; i++) {
      if (got[i] !== want[i]) {
        out.push(`#${i}\n  mám:    ${got[i]}\n  ukázka: ${want[i]}`);
      }
    }
    return out;
  };

  it('rámcová smlouva má stejný text jako ukázka', async () => {
    const bytes = await renderDocxTemplate(read('RES_OM_Ramcova_smlouva_SABLONA_v01.docx'), rc.common);
    const got = await docxPlainText(bytes);
    const want = await docxPlainText(read('Ramcova_smlouva_OM_RES-OM-2026-001.docx'));
    expect(diff(got, want)).toEqual([]);
    expect(got.length).toBe(want.length);
  });

  it('příloha lokality má stejný text jako ukázka', async () => {
    const bytes = await renderDocxTemplate(read('RES_OM_Priloha_lokality_SABLONA_v01.docx'), rc.annexes[0].context);
    const got = await docxPlainText(bytes);
    const want = await docxPlainText(read('Priloha_lokality_1_10500.docx'));
    expect(diff(got, want)).toEqual([]);
    expect(got.length).toBe(want.length);
  });
});
