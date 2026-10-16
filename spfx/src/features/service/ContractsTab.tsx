/**
 * Smlouvy se zákazníky (Servis → Správa smluv): seznam smluv, založení nové smlouvy k lokalitě a detail smlouvy s verzemi (návrh, k podpisu,
 * podepsaná, nahrazená), dodatky, porovnáním verzí a změnami stavu. Obsah smlouvy se upravuje v `ContractEditor`. Word se generuje v další etapě.
 */

import * as React from 'react';
import { ActionButton, DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { formatDate } from '../../core/format';
import { Partner } from '../../core/types';
import { canDeleteInService, canManageSites, ServiceDevice, ServiceSite } from '../../core/service';
import { SERVICE_CATALOG as CATALOG } from '../../core/serviceCatalog.data';
import {
  activeVersion,
  buildContractInput,
  contractStatusChange,
  contractSummary,
  describeChanges,
  hasBlockingError,
  validateContract,
  latestVersion,
  newVersionProblem,
  nextContractNumber,
  ServiceContract,
  ServiceContractVersion
} from '../../core/serviceContract';
import { applyRegister, lookupRegisterByIco } from '../../data/ares';
import { ContractEditor } from './ContractEditor';
import { ContractPreviewPanel } from './ContractPreviewPanel';
import { generateContractFiles } from './contractDocuments';
import { CommentDialog } from './ServiceDialogs';
import { TD, TH } from './serviceUi';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  'Návrh': { bg: '#FFF1CC', fg: '#7A5A00' },
  'K podpisu': { bg: '#DDEBFA', fg: '#1F5C99' },
  'Podepsaná': { bg: '#E4F6EC', fg: '#1D7A4B' },
  'Nahrazená': { bg: '#EEEEEE', fg: '#555555' }
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS['Návrh'];
  return <span style={{ display: 'inline-block', borderRadius: 10, padding: '1px 9px', fontSize: 12, whiteSpace: 'nowrap', background: c.bg, color: c.fg }}>{status}</span>;
};

export const ContractsTab: React.FC = () => {
  const { repos, user, settings } = useApp();
  const mayManage = canManageSites(user.roles);
  const mayDelete = canDeleteInService(user.roles);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [notice, setNotice] = React.useState<string | undefined>(undefined);
  const [sites, setSites] = React.useState<ServiceSite[]>([]);
  const [devices, setDevices] = React.useState<ServiceDevice[]>([]);
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [contracts, setContracts] = React.useState<ServiceContract[]>([]);
  const [versions, setVersions] = React.useState<ServiceContractVersion[]>([]);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [newDlg, setNewDlg] = React.useState(false);
  const [detail, setDetail] = React.useState<string | undefined>(undefined);
  const [editing, setEditing] = React.useState<ServiceContractVersion | undefined>(undefined);
  const [compare, setCompare] = React.useState<number | undefined>(undefined);
  const [signDlg, setSignDlg] = React.useState<ServiceContractVersion | undefined>(undefined);
  const [versionDlg, setVersionDlg] = React.useState<string | undefined>(undefined);
  const [deleteDlg, setDeleteDlg] = React.useState<ServiceContractVersion | undefined>(undefined);
  const [preview, setPreview] = React.useState<ServiceContractVersion | undefined>(undefined);
  const [generating, setGenerating] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([repos.service.listSites(), repos.service.listDevices(), repos.partners.list({}).catch((): Partner[] => []), repos.service.listContracts(), repos.service.listContractVersions()])
      .then(([s, d, p, c, v]) => {
        if (!cancelled) {
          setSites(s);
          setDevices(d);
          setPartners(p);
          setContracts(c);
          setVersions(v);
          setLoaded(true);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, reloadKey]);

  const reload = (): void => setReloadKey((k) => k + 1);
  const fail = (e: unknown): void => setError(e instanceof Error ? e.message : String(e));
  const siteLabel = (n: string): string => {
    const s = sites.filter((x) => x.number === n)[0];
    return s ? `${s.number} ${s.name}` : n;
  };
  const versionsOf = (n: string): ServiceContractVersion[] => versions.filter((v) => v.contractNumber === n).sort((a, b) => a.versionNo - b.versionNo);

  const createContract = (siteNumber: string): Promise<unknown> => {
    const site = sites.filter((s) => s.number === siteNumber)[0];
    if (!site) {
      return Promise.reject(new Error('Vyberte lokalitu.'));
    }
    const partner = partners.filter((p) => p.id === site.customerId || (!site.customerId && p.name === site.customerName))[0];
    const number = nextContractNumber(site.number, contracts.map((c) => c.number));
    const input = buildContractInput({ catalog: CATALOG, contractNumber: number, site, devices, partner, settings: settings.service.contract });
    // Údaje objednatele z obchodního rejstříku (spisová značka, jediný jednatel); nepodaří-li se, doplní se v editoru tlačítkem Načíst z ARES.
    const ico = input.objednatel.ico.trim();
    const withRegister: Promise<{ filled: boolean }> = /^\d{8}$/.test(ico)
      ? lookupRegisterByIco(ico).then((reg) => {
          input.objednatel = applyRegister(input.objednatel, reg);
          return { filled: !!reg.registration || reg.representatives.length > 0 };
        }, () => ({ filled: false }))
      : Promise.resolve({ filled: false });
    return withRegister.then((r) =>
      repos.service.createContract(site.number, input, user).then((v) => {
        setNewDlg(false);
        setNotice(`Smlouva ${number} je založená jako návrh${r.filled ? ' (údaje objednatele doplněné z ARES)' : ''}. Doplňte chybějící údaje a cenu.`);
        reload();
        setEditing(v);
      })
    );
  };

  const changeStatus = (v: ServiceContractVersion, status: string, signedUrl?: string): Promise<unknown> =>
    repos.service.changeContractStatus(v.contractNumber, v.versionNo, status, signedUrl, user).then(() => {
      setNotice(`Verze ${v.versionNo} smlouvy ${v.contractNumber}: ${status.toLocaleLowerCase('cs-CZ')}.`);
      reload();
    });

  const generate = (v: ServiceContractVersion): void => {
    setGenerating(v.id);
    setError(undefined);
    repos.service
      .loadContractTemplates()
      .then((t) => generateContractFiles(v, t))
      .then((files) => repos.service.saveContractDocuments(v.contractNumber, v.versionNo, files.map((f) => ({ name: f.name, bytes: f.bytes })), user))
      .then((docs) => {
        setNotice(`Vygenerováno ${docs.length} dokumentů verze ${v.versionNo} a uloženo do složky lokality (01-Smlouva a podmínky).`);
        reload();
      })
      .catch(fail)
      .then(() => setGenerating(undefined), () => setGenerating(undefined));
  };

  if (!loaded) {
    return <Spinner size={SpinnerSize.large} label="Načítám smlouvy…" />;
  }

  const detailContract = detail ? contracts.filter((c) => c.number === detail)[0] : undefined;
  const detailVersions = detail ? versionsOf(detail) : [];

  return (
    <div style={{ marginTop: 10 }}>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
          {error}
        </MessageBar>
      )}
      {notice && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setNotice(undefined)}>
          {notice}
        </MessageBar>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: RES.gray }}>
          Smlouva patří vždy jedné lokalitě (číslo např. 10500-01) a má verze: původní smlouva a dodatky. Kontroly (P1 ≤ 72 h, 10 let, autorizace OEM u BESS) blokují předání k podpisu.
        </span>
        <span style={{ flex: '1 1 auto' }} />
        {mayManage && <PrimaryButton iconProps={{ iconName: 'Add' }} text="Nová smlouva" disabled={sites.length === 0} onClick={() => setNewDlg(true)} />}
      </div>

      {contracts.length === 0 ? (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Zatím není žádná smlouva. {mayManage ? 'Založte ji tlačítkem Nová smlouva — vybere se lokalita a smlouva se předvyplní z partnera (objednatele), nastavení smluv a checklistu lokality.' : ''}
        </MessageBar>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: RES.white, border: `1px solid ${RES.grayBlue}` }}>
            <thead>
              <tr>
                <th style={TH}>Smlouva</th>
                <th style={TH}>Lokalita</th>
                <th style={TH}>Objednatel</th>
                <th style={TH}>Verze</th>
                <th style={TH}>Stav</th>
                <th style={TH}>Platí od</th>
                <th style={TH}>Soubory / činnosti</th>
                <th style={TH}>Kontrola</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const last = latestVersion(versions, c.number);
                const active = activeVersion(versions, c.number);
                const s = last ? contractSummary(CATALOG, last.snapshot) : undefined;
                return (
                  <tr key={c.id} style={{ borderTop: `1px solid ${RES.background}`, cursor: 'pointer' }} onClick={() => setDetail(c.number)}>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      <Link>{c.number}</Link>
                    </td>
                    <td style={TD}>{siteLabel(c.siteNumber)}</td>
                    <td style={TD}>{last ? last.snapshot.objednatel.nazev : c.customerName}</td>
                    <td style={TD}>{last ? `${last.versionNo} (${last.kind.toLocaleLowerCase('cs-CZ')})` : '—'}</td>
                    <td style={TD}>{last && <StatusPill status={last.status} />}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{active && active.effectiveFrom ? formatDate(active.effectiveFrom) : '—'}</td>
                    <td style={TD}>{s ? `${s.assets} / ${s.activities}` : '—'}</td>
                    <td style={TD}>
                      {s && s.errors + s.missing + s.warnings === 0 && <span style={{ color: '#1D7A4B' }}>v pořádku</span>}
                      {s && s.errors > 0 && <span style={{ color: '#8A2A2A' }}>{s.errors} chyb </span>}
                      {s && s.missing > 0 && <span style={{ color: '#7A5A00' }}>{s.missing} k doplnění </span>}
                      {s && s.warnings > 0 && <span style={{ color: RES.gray }}>{s.warnings} varování</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {newDlg && <NewContractDialog sites={sites} contracts={contracts} onCreate={createContract} onClose={() => setNewDlg(false)} />}

      {detailContract && (
        <Panel isOpen onDismiss={() => setDetail(undefined)} type={PanelType.large} headerText={`Smlouva ${detailContract.number} · ${siteLabel(detailContract.siteNumber)}`} closeButtonAriaLabel="Zavřít">
          <div style={{ fontSize: 13, color: RES.gray, marginBottom: 8 }}>Objednatel: {detailVersions.length > 0 ? detailVersions[detailVersions.length - 1].snapshot.objednatel.nazev : detailContract.customerName}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {mayManage && <DefaultButton iconProps={{ iconName: 'Add' }} text="Nová verze (dodatek)…" disabled={newVersionProblem(detailVersions) !== ''} title={newVersionProblem(detailVersions) || 'Založí dodatek jako kopii poslední podepsané verze'} onClick={() => setVersionDlg(detailContract.number)} />}
            {mayManage && newVersionProblem(detailVersions) !== '' && <span style={{ fontSize: 12, color: RES.gray }}>{newVersionProblem(detailVersions)}</span>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Verze</th>
                <th style={TH}>Stav</th>
                <th style={TH}>Účinnost</th>
                <th style={TH}>Kontrola</th>
                <th style={TH}>Podpis</th>
                <th style={TH} />
              </tr>
            </thead>
            <tbody>
              {detailVersions.map((v, idx) => {
                const s = contractSummary(CATALOG, v.snapshot);
                const prev = idx > 0 ? detailVersions[idx - 1] : undefined;
                const toSign = contractStatusChange(CATALOG, detailVersions, v.versionNo, 'K podpisu').problem;
                return (
                  <React.Fragment key={v.id}>
                    <tr style={{ borderTop: `1px solid ${RES.background}` }}>
                      <td style={TD}>
                        <strong>{v.versionNo}</strong> <span style={{ color: RES.gray }}>({v.kind.toLocaleLowerCase('cs-CZ')})</span>
                        {v.changeNote && <div style={{ color: RES.gray, fontSize: 12, maxWidth: 260 }}>{v.changeNote}</div>}
                      </td>
                      <td style={TD}>
                        <StatusPill status={v.status} />
                      </td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{v.effectiveFrom ? formatDate(v.effectiveFrom) : '—'}</td>
                      <td style={{ ...TD, fontSize: 12 }}>
                        {s.errors + s.missing + s.warnings === 0 ? <span style={{ color: '#1D7A4B' }}>v pořádku</span> : `${s.errors} chyb · ${s.missing} k doplnění · ${s.warnings} varování`}
                      </td>
                      <td style={{ ...TD, fontSize: 12 }}>
                        {v.signedAt ? `${formatDate(v.signedAt)}, ${v.signedByName ?? ''}` : '—'}
                        {v.signedUrl && (
                          <div>
                            <Link href={v.signedUrl} target="_blank" rel="noopener noreferrer">
                              Podepsaná verze
                            </Link>
                          </div>
                        )}
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <ActionButton text={v.status === 'Návrh' && mayManage ? 'Upravit' : 'Otevřít'} onClick={() => setEditing(v)} styles={{ root: { height: 28 } }} />
                        <ActionButton text="Náhled" iconProps={{ iconName: 'View' }} onClick={() => setPreview(v)} styles={{ root: { height: 28 } }} />
                        {mayManage && <ActionButton text={generating === v.id ? 'Generuji…' : 'Vygenerovat Word'} iconProps={{ iconName: 'WordDocument' }} disabled={generating !== undefined || hasBlockingError(validateContract(CATALOG, v.snapshot))} title={hasBlockingError(validateContract(CATALOG, v.snapshot)) ? 'Smlouva má chybu (požadavky banky) — nejdřív ji opravte, viz Kontrola' : 'Vykreslí šablony a uloží Word do složky lokality'} onClick={() => generate(v)} styles={{ root: { height: 28 } }} />}
                        {mayManage && v.status === 'Návrh' && <ActionButton text="K podpisu" title={toSign || 'Předat k podpisu'} disabled={toSign !== ''} onClick={() => changeStatus(v, 'K podpisu').catch(fail)} styles={{ root: { height: 28 } }} />}
                        {mayManage && v.status === 'K podpisu' && <ActionButton text="Vrátit do návrhu" onClick={() => changeStatus(v, 'Návrh').catch(fail)} styles={{ root: { height: 28 } }} />}
                        {mayManage && v.status === 'K podpisu' && <ActionButton text="Podepsáno…" onClick={() => setSignDlg(v)} styles={{ root: { height: 28 } }} />}
                        {prev && <ActionButton text={compare === v.versionNo ? 'Skrýt změny' : 'Změny'} onClick={() => setCompare(compare === v.versionNo ? undefined : v.versionNo)} styles={{ root: { height: 28 } }} />}
                        {mayDelete && v.status === 'Návrh' && <ActionButton text="Smazat" iconProps={{ iconName: 'Delete' }} onClick={() => setDeleteDlg(v)} styles={{ root: { height: 28 } }} />}
                      </td>
                    </tr>
                    {v.documents && v.documents.length > 0 && (
                      <tr>
                        <td colSpan={6} style={{ ...TD, fontSize: 12, paddingTop: 0 }}>
                          <strong>Dokumenty:</strong>{' '}
                          {v.documents.map((d, k) => (
                            <span key={d.url + k}>
                              {k > 0 ? ' · ' : ''}
                              <Link href={d.url} target="_blank" rel="noopener noreferrer">
                                {d.name}
                              </Link>
                              {d.createdAt ? ` (${formatDate(d.createdAt)})` : ''}
                            </span>
                          ))}
                        </td>
                      </tr>
                    )}
                    {prev && compare === v.versionNo && (
                      <tr>
                        <td colSpan={6} style={{ ...TD, background: RES.background, fontSize: 12 }}>
                          <strong>Změny oproti verzi {prev.versionNo}:</strong>
                          {describeChanges(prev.snapshot, v.snapshot, CATALOG).length === 0 ? ' beze změny.' : describeChanges(prev.snapshot, v.snapshot, CATALOG).map((c, k) => <div key={k}>• {c}</div>)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {editing && (
        <ContractEditor
          version={editing}
          site={sites.filter((s) => s.number === editing.contractNumber.split('-')[0])[0]}
          devices={devices}
          previous={versionsOf(editing.contractNumber).filter((v) => v.versionNo < editing.versionNo).sort((a, b) => b.versionNo - a.versionNo)[0]?.snapshot}
          canEdit={mayManage && editing.status === 'Návrh'}
          onSave={(snapshot, meta) =>
            repos.service.saveContractVersion(editing.contractNumber, editing.versionNo, snapshot, meta, user).then((v) => {
              setEditing(v);
              setNotice('Smlouva je uložená.');
              reload();
            })
          }
          onClose={() => setEditing(undefined)}
        />
      )}

      {preview && <ContractPreviewPanel version={preview} onClose={() => setPreview(undefined)} />}
      {signDlg && (
        <CommentDialog
          title={`Zaznamenat podpis — smlouva ${signDlg.contractNumber}, verze ${signDlg.versionNo}`}
          subText="Verze se stane podepsanou (už nepůjde upravit) a dříve podepsané verze se označí jako nahrazené."
          label="Odkaz na sken podepsané smlouvy (nepovinný)"
          required={false}
          confirm="Zaznamenat podpis"
          onConfirm={(text) => changeStatus(signDlg, 'Podepsaná', text.trim() || undefined)}
          onSaved={() => setSignDlg(undefined)}
          onClose={() => setSignDlg(undefined)}
        />
      )}
      {versionDlg && (
        <CommentDialog
          title={`Nová verze (dodatek) smlouvy ${versionDlg}`}
          subText="Dodatek vznikne jako kopie poslední podepsané verze ve stavu Návrh; změny pak uděláte v editoru."
          label="Popis změn (co se mění)"
          required
          confirm="Založit dodatek"
          onConfirm={(text) =>
            (text.trim() === '' ? Promise.reject(new Error('Popište, co se v dodatku mění.')) : repos.service.createContractVersion(versionDlg, text.trim(), user)).then((v) => {
              setNotice(`Založena verze ${v.versionNo} (dodatek) smlouvy ${versionDlg}.`);
              reload();
              setEditing(v);
            })
          }
          onSaved={() => setVersionDlg(undefined)}
          onClose={() => setVersionDlg(undefined)}
        />
      )}
      {deleteDlg && (
        <CommentDialog
          title={`Smazat návrh — smlouva ${deleteDlg.contractNumber}, verze ${deleteDlg.versionNo}?`}
          subText={versionsOf(deleteDlg.contractNumber).length === 1 ? 'Je to jediná verze, smaže se i celá smlouva. V SharePointu jde do koše webu.' : 'Smaže se jen tento návrh (do koše webu).'}
          label="Poznámka (nepovinná)"
          required={false}
          confirm="Smazat návrh"
          onConfirm={() =>
            repos.service.deleteContractVersion(deleteDlg.contractNumber, deleteDlg.versionNo, user).then(() => {
              if (versionsOf(deleteDlg.contractNumber).length === 1) {
                setDetail(undefined);
              }
              setNotice('Návrh je smazaný.');
              reload();
            })
          }
          onSaved={() => setDeleteDlg(undefined)}
          onClose={() => setDeleteDlg(undefined)}
        />
      )}
    </div>
  );
};

const NewContractDialog: React.FC<{ sites: ServiceSite[]; contracts: ServiceContract[]; onCreate: (siteNumber: string) => Promise<unknown>; onClose: () => void }> = ({ sites, contracts, onCreate, onClose }) => {
  const [siteNumber, setSiteNumber] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const site = sites.filter((s) => s.number === siteNumber)[0];
  const existing = contracts.filter((c) => c.siteNumber === siteNumber).length;
  return (
    <Dialog hidden={false} onDismiss={busy ? undefined : onClose} dialogContentProps={{ type: DialogType.normal, title: 'Nová smlouva', subText: 'Smlouva se založí jako návrh k vybrané lokalitě. Předvyplní se z partnera (objednatel), nastavení smluv a checklistu lokality.' }} modalProps={{ isBlocking: true }} minWidth={520}>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      <Dropdown label="Lokalita" required placeholder="Vyberte lokalitu" selectedKey={siteNumber || null} options={sites.filter((s) => s.isActive).map((s) => ({ key: s.number, text: `${s.number} ${s.name}${s.customerName ? ` — ${s.customerName}` : ''}` }))} onChange={(_, o) => o && setSiteNumber(String(o.key))} />
      {site && !site.customerName && <MessageBar messageBarType={MessageBarType.warning} isMultiline styles={{ root: { marginTop: 8 } }}>Lokalita nemá zákazníka (partnera) — objednatele doplníte ručně.</MessageBar>}
      {site && existing > 0 && <MessageBar messageBarType={MessageBarType.info} isMultiline styles={{ root: { marginTop: 8 } }}>K lokalitě už existuje {existing} smlouva. Změny stávající smlouvy se dělají novou verzí (dodatkem); novou smlouvu zakládejte jen pro jiný právní vztah.</MessageBar>}
      <DialogFooter>
        <PrimaryButton
          text={busy ? 'Zakládám…' : 'Založit smlouvu'}
          disabled={busy || !site}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            onCreate(siteNumber).catch((e: unknown) => {
              setBusy(false);
              setError(e instanceof Error ? e.message : String(e));
            });
          }}
        />
        <DefaultButton text="Zrušit" disabled={busy} onClick={onClose} />
      </DialogFooter>
    </Dialog>
  );
};
