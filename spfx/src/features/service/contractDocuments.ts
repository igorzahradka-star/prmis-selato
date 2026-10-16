/**
 * Vygenerování dokumentů smlouvy z jedné verze: rámcová smlouva a Příloha lokality (Word z šablon RES), strojově čitelný checklist lokality
 * a náhled v aplikaci (Word → HTML). Čistá orchestrace nad `buildRenderContext` a `renderDocxTemplate`; ukládání do SharePointu řeší repozitář.
 */

import { SERVICE_CATALOG } from '../../core/serviceCatalog.data';
import { ServiceContractVersion } from '../../core/serviceContract';
import { buildRenderContext, checklistExport } from '../../core/serviceContractRender';
import { renderDocxTemplate } from './docxTemplate';

export interface GeneratedFile {
  name: string;
  bytes: Uint8Array;
  /** Pro náhled: Word (docx), nebo ostatní soubor (checklist). */
  kind: 'docx' | 'json';
  title: string;
}

const safe = (s: string): string => s.replace(/[^\w.-]+/g, '-');

/** Vykreslí všechny dokumenty verze smlouvy: rámcovou smlouvu, přílohu každé lokality a checklist lokality (JSON). */
export async function generateContractFiles(version: ServiceContractVersion, templates: { framework: Uint8Array; annex: Uint8Array }): Promise<GeneratedFile[]> {
  const rc = buildRenderContext(SERVICE_CATALOG, version.snapshot);
  const cislo = safe(version.snapshot.smlouva.cislo || version.contractNumber);
  const suffix = `v${version.versionNo}`;
  const files: GeneratedFile[] = [];
  files.push({ name: `Ramcova_smlouva_OM_${cislo}_${suffix}.docx`, bytes: await renderDocxTemplate(templates.framework, rc.common), kind: 'docx', title: 'Rámcová smlouva' });
  for (const a of rc.annexes) {
    files.push({ name: `Priloha_lokality_${safe(a.site.priloha_cislo)}_${safe(a.site.kod)}_${cislo}_${suffix}.docx`, bytes: await renderDocxTemplate(templates.annex, a.context), kind: 'docx', title: `Příloha lokality ${a.site.kod} ${a.site.nazev}` });
    files.push({ name: `checklist_${safe(a.site.kod)}_${cislo}_${suffix}.json`, bytes: new TextEncoder().encode(JSON.stringify(checklistExport(SERVICE_CATALOG, version.snapshot, a.site), null, 2)), kind: 'json', title: `Checklist lokality ${a.site.kod}` });
  }
  return files;
}

/** Náhled Wordu v aplikaci: text a tabulky převedené na HTML (bez věrného vzhledu — písma, záhlaví a grafy v něm nejsou). */
export async function docxToHtml(bytes: Uint8Array): Promise<string> {
  const mammoth = await import(/* webpackChunkName: 'docx-preview' */ 'mammoth');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return result.value;
}
