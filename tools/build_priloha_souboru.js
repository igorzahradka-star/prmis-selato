/**
 * Sestaví šablonu „Příloha souboru“ (docxtpl) ze šablony „Příloha lokality“: stejný vzhled, záhlaví a zápatí, jen obsah pro jeden soubor
 * (FVE, BESS…) — identifikace souboru, plán údržby souboru, SLA, garantovaná dostupnost, cena (odkaz na Přílohu lokality), strategické
 * náhradní díly souboru a podpisy. Použití:
 *
 *   node tools/build_priloha_souboru.js <RES_OM_Priloha_lokality_SABLONA_v01.docx> <vystup: RES_OM_Priloha_souboru_SABLONA_v01.docx>
 *
 * Kontext šablony vytváří `buildRenderContext` (`core/serviceContractRender.ts`): kromě společných údajů `lokalita` a `soubor`
 * (kod, nazev, typ, typ_nazev, poradi, parametry, technologie, zaruky, vyrobce_oem, dostupnost, metodika_cl, checklist, kvalifikace_legenda, nd).
 */
const fs = require('fs');
const path = require('path');
const JSZip = require(path.join(__dirname, '..', 'spfx', 'node_modules', 'jszip'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rozdělí tělo dokumentu na nejvyšší bloky (odstavce, tabulky, sectPr). */
function splitBlocks(body) {
  const blocks = [];
  let i = 0;
  while (i < body.length) {
    if (body.startsWith('<w:p ', i) || body.startsWith('<w:p>', i)) {
      const e = body.indexOf('</w:p>', i) + 6;
      blocks.push({ t: 'p', xml: body.slice(i, e) });
      i = e;
    } else if (body.startsWith('<w:tbl>', i)) {
      let d = 0;
      let j = i;
      const re = /<w:tbl>|<\/w:tbl>/g;
      re.lastIndex = i;
      let m;
      while ((m = re.exec(body))) {
        if (m[0] === '<w:tbl>') d++;
        else d--;
        if (d === 0) {
          j = m.index + 8;
          break;
        }
      }
      blocks.push({ t: 'tbl', xml: body.slice(i, j) });
      i = j;
    } else if (body.startsWith('<w:sectPr', i)) {
      const e = body.indexOf('</w:sectPr>', i) + 11;
      blocks.push({ t: 'sect', xml: body.slice(i, e) });
      i = e;
    } else {
      i++;
    }
  }
  return blocks;
}

/** Nahradí text odstavce: první úsek dostane nový text, ostatní úseky se odstraní (vzhled prvního úseku zůstává). */
function setText(p, text) {
  let first = true;
  return p.replace(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
    if (!first) {
      return '';
    }
    first = false;
    if (/<w:t[ >]/.test(run)) {
      return run.replace(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>/, `<w:t xml:space="preserve">${esc(text)}</w:t>`).replace(/(<\/w:t>)[\s\S]*?(<\/w:r>)$/, '$1$2');
    }
    return run;
  });
}

/** Nastaví texty buněk řádku (první odstavec každé buňky). */
function setRow(tr, texts) {
  let n = 0;
  return tr.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => {
    const text = texts[n++];
    if (text === undefined) {
      return tc;
    }
    let done = false;
    return tc.replace(/<w:p[ >][\s\S]*?<\/w:p>/, (p) => {
      if (done) {
        return p;
      }
      done = true;
      return setText(p, text);
    });
  });
}

const rowsOf = (tbl) => tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
const replaceRows = (tbl, rows) => {
  const old = rowsOf(tbl);
  return tbl.slice(0, tbl.indexOf(old[0])) + rows.join('') + tbl.slice(tbl.indexOf(old[old.length - 1]) + old[old.length - 1].length);
};

async function main() {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) {
    throw new Error('Použití: node tools/build_priloha_souboru.js <Priloha_lokality.docx> <vystup.docx>');
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(src));
  const xml = await zip.file('word/document.xml').async('string');
  const bodyStart = xml.indexOf('<w:body>') + 8;
  const bodyEnd = xml.lastIndexOf('</w:body>');
  const blocks = splitBlocks(xml.slice(bodyStart, bodyEnd));
  const B = (k) => blocks[k].xml;

  // Identifikace souboru: tabulka (dvojice popisek / hodnota) z tabulky identifikace lokality.
  const idRows = rowsOf(B(6));
  const idPairs = [
    ['Kód a název souboru', '{{ soubor.kod }} – {{ soubor.nazev }}'],
    ['Typ zařízení', '{{ soubor.typ_nazev }}'],
    ['Výkon / kapacita', '{{ soubor.parametry }}'],
    ['Hlavní technologie', '{{ soubor.technologie }}'],
    ['Výrobce (OEM)', '{{ soubor.vyrobce_oem }}'],
    ['Záruky / LTSA', '{{ soubor.zaruky }}'],
    ['Lokalita', '{{ lokalita.kod }} – {{ lokalita.nazev }}, {{ lokalita.adresa }}']
  ];
  const idTable = replaceRows(B(6), idPairs.map((pair) => setRow(idRows[0], pair)));

  // Plán údržby: sekce jen pro typ souboru (soubor.checklist).
  const checklistLoop = setText(B(18), '{%p for s in soubor.checklist %}');

  // Dostupnost: jediný řádek souboru (bez smyčky přes assety).
  const availRows = rowsOf(B(32));
  const availFull = replaceRows(B(32), [availRows[0], setRow(availRows[2], ['{{ soubor.kod }} – {{ soubor.typ }}', '{{ soubor.dostupnost }} %', 'Příloha 2, čl. {{ soubor.metodika_cl }}'])]);

  // Strategické náhradní díly: smyčka přes soubor.nd.
  const ndRows = rowsOf(B(41));
  const ndTable = replaceRows(B(41), [ndRows[0], setRow(ndRows[1], ['{%tr for n in soubor.nd %}']), ndRows[2], ndRows[3]]);

  const parts = [
    setText(B(0), 'PŘÍLOHA SOUBORU č. {{ lokalita.priloha_cislo }}/{{ soubor.poradi }}'),
    setText(B(1), '{{ soubor.kod }} – {{ soubor.nazev }} ({{ soubor.typ }})'),
    B(2),
    B(3),
    setText(B(4), 'K Příloze lokality č. {{ lokalita.priloha_cislo }} ({{ lokalita.kod }} – {{ lokalita.nazev }}) · Verze přílohy: {{ lokalita.verze }} · Datum zahájení Služeb: {{ lokalita.datum_zahajeni }}'),
    setText(B(5), 'A. Identifikace souboru'),
    idTable,
    B(7),
    setText(B(16), 'B. Plán preventivní údržby a rozsah činností souboru'),
    B(17),
    checklistLoop,
    B(19),
    B(20),
    B(21),
    B(22),
    setText(B(23), 'Kvalifikace: {{ soubor.kvalifikace_legenda }}'),
    setText(B(24), 'C. Reakční doby (SLA)'),
    B(25),
    B(26),
    B(27),
    B(28),
    B(29),
    B(30),
    setText(B(31), 'D. Garantovaná Technická dostupnost'),
    availFull,
    B(33),
    setText(B(34), 'E. Cena'),
    setText(B(39), 'Cena služeb pro tento soubor je součástí ročního Paušálu podle Přílohy lokality č. {{ lokalita.priloha_cislo }}, část G (Cena); samostatně se neúčtuje.'),
    setText(B(46), '{%p if soubor.nd %}'),
    setText(B(40), 'F. Strategické náhradní díly souboru'),
    ndTable,
    B(42),
    B(51),
    B(52),
    B(53),
    B(54)
  ];

  zip.file('word/document.xml', xml.slice(0, bodyStart) + parts.join('') + xml.slice(bodyEnd));
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('Šablona Příloha souboru uložena:', out);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
