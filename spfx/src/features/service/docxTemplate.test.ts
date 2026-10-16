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

describe('příloha souboru', () => {
  const input = exampleInput();
  const rc = buildRenderContext(CAT, input);

  it('pro každý soubor lokality vznikne příloha s jeho údaji a činnostmi jen jeho typu', async () => {
    expect(rc.assetAnnexes.map((a) => a.asset.kod)).toEqual(['10501', '10502']);
    const bess = rc.assetAnnexes[1];
    const text = (await docxPlainText(await renderDocxTemplate(read('RES_OM_Priloha_souboru_SABLONA_v01.docx'), bess.context))).join('\n');
    expect(text).toContain('PŘÍLOHA SOUBORU č. 1/2');
    expect(text).toContain('10502 – Mastířovice II. (BESS)');
    expect(text).toContain('25 644 kWh');
    expect(text).toContain('Bateriové úložiště energie');
    expect(text).toContain('Příloha 2, čl. 2.2');
    expect(text).toContain('RES-OM-2026-001');
    // činnosti BESS ano, činnosti FVE ne
    const bessIds = CAT.cinnosti.filter((a) => a.asset === 'BESS').map((a) => a.id);
    const fveIds = CAT.cinnosti.filter((a) => a.asset === 'FVE').map((a) => a.id);
    expect(bessIds.filter((id) => text.indexOf(id) >= 0).length).toBeGreaterThan(10);
    expect(fveIds.filter((id) => text.indexOf(id) >= 0)).toEqual([]);
    expect(text).not.toContain('Zvláštní ujednání');
    expect(text).not.toMatch(/\{\{|\{%/);
  });

  it('náhradní díly se zobrazí jen u souboru, ke kterému patří, a bez nich se oddíl vynechá', async () => {
    const tpl = read('RES_OM_Priloha_souboru_SABLONA_v01.docx');
    const withNd = JSON.parse(JSON.stringify(input)) as ContractInput;
    withNd.lokality[0].nd = [{ polozka: 'Řídicí deska BMS', asset: '10502', mnozstvi: '1', umisteni: 'sklad RES' }];
    const rcNd = buildRenderContext(CAT, withNd);
    const bess = (await docxPlainText(await renderDocxTemplate(tpl, rcNd.assetAnnexes[1].context))).join('\n');
    const fve = (await docxPlainText(await renderDocxTemplate(tpl, rcNd.assetAnnexes[0].context))).join('\n');
    expect(bess).toContain('Strategické náhradní díly souboru');
    expect(bess).toContain('Řídicí deska BMS');
    expect(fve).not.toContain('Strategické náhradní díly souboru');
    expect(fve).not.toContain('Řídicí deska BMS');
  });
});
