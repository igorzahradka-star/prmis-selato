/**
 * Náhled smlouvy v aplikaci: vykreslí šablony Wordu daty verze a ukáže je jako text s tabulkami (rámcová smlouva a příloha každé lokality).
 * Náhled je věrný obsahem, ne vzhledem (písma, záhlaví a grafy v něm nejsou); rozhodující je vygenerovaný Word.
 */

import * as React from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { ServiceContractVersion } from '../../core/serviceContract';
import { docxToHtml, generateContractFiles } from './contractDocuments';

const CSS = `
.contract-preview { font-size: 13px; line-height: 1.45; }
.contract-preview table { border-collapse: collapse; margin: 6px 0; width: 100%; }
.contract-preview td, .contract-preview th { border: 1px solid #C8D0D8; padding: 2px 6px; vertical-align: top; }
.contract-preview p { margin: 4px 0; }
.contract-preview h1, .contract-preview h2, .contract-preview h3 { color: #12304F; margin: 12px 0 4px; }
`;

export const ContractPreviewPanel: React.FC<{ version: ServiceContractVersion; onClose: () => void }> = ({ version, onClose }) => {
  const { repos } = useApp();
  const [docs, setDocs] = React.useState<{ title: string; html: string }[] | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    repos.service
      .loadContractTemplates()
      .then((t) => generateContractFiles(version, t))
      .then(async (files) => {
        const out: { title: string; html: string }[] = [];
        for (const f of files.filter((x) => x.kind === 'docx')) {
          out.push({ title: f.title, html: await docxToHtml(f.bytes) });
        }
        if (!cancelled) {
          setDocs(out);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, version]);

  return (
    <Panel isOpen onDismiss={onClose} type={PanelType.custom} customWidth="900px" headerText={`Náhled smlouvy ${version.contractNumber} · verze ${version.versionNo}`} closeButtonAriaLabel="Zavřít" isFooterAtBottom onRenderFooterContent={() => <DefaultButton text="Zavřít" onClick={onClose} />}>
      <style>{CSS}</style>
      <MessageBar messageBarType={MessageBarType.info} isMultiline>
        Náhled ukazuje obsah (text a tabulky) smlouvy vyplněné údaji této verze. Vzhled — písma, záhlaví, loga a grafy — v něm není; ten má až vygenerovaný Word.
      </MessageBar>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!docs && !error && <Spinner size={SpinnerSize.large} label="Připravuji náhled…" />}
      {docs &&
        docs.map((d) => (
          <div key={d.title} style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, color: RES.navy, borderBottom: `2px solid ${RES.navy}`, marginBottom: 6 }}>{d.title}</div>
            <div className="contract-preview" style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, padding: 12 }} dangerouslySetInnerHTML={{ __html: d.html }} />
          </div>
        ))}
    </Panel>
  );
};
