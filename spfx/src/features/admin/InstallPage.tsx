/**
 * Správa → Instalace a diagnostika.
 *
 * Nahrazuje PowerShell: aplikace si svou datovou strukturu založí sama.
 * Nejdřív ukáže, co existuje a co chybí, a teprve na tlačítko chybějící části
 * doplní. Nikdy nic nemaže.
 */

import * as React from 'react';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { ProgressIndicator } from '@fluentui/react/lib/ProgressIndicator';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { DiagnosticItem, DiagnosticReport, InstallProgress } from '../../data/repositories';
import { canOpenAdmin } from '../../core/roles';

export const InstallPage: React.FC = () => {
  const { repos, user, dataSource } = useApp();

  const [report, setReport] = React.useState<DiagnosticReport | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [progress, setProgress] = React.useState<InstallProgress | undefined>(undefined);
  const [confirmOpen, setConfirmOpen] = React.useState<boolean>(false);
  const [finished, setFinished] = React.useState<boolean>(false);

  const runDiagnose = React.useCallback((): void => {
    setReport(undefined);
    setError(undefined);
    repos.install
      .diagnose()
      .then(setReport)
      .catch((e: Error) => setError(e.message));
  }, [repos]);

  React.useEffect(runDiagnose, [runDiagnose]);

  if (!canOpenAdmin(user.roles)) {
    return (
      <MessageBar messageBarType={MessageBarType.blocked} isMultiline>
        Tuto stránku vidí jen administrátor PRM. Pokud instalaci potřebujete spustit,
        požádejte správce SharePointu o přidání do skupiny administrátorů.
      </MessageBar>
    );
  }

  const runInstall = (): void => {
    setConfirmOpen(false);
    setFinished(false);
    setError(undefined);
    setProgress({ step: 'Spouštím…', done: 0, total: 1 });

    repos.install
      .install(setProgress)
      .then((r) => {
        setReport(r);
        setProgress(undefined);
        setFinished(true);
      })
      .catch((e: Error) => {
        setError(e.message);
        setProgress(undefined);
      });
  };

  const missing = report ? report.items.filter((i) => i.state === 'missing') : [];
  const manual = report ? report.items.filter((i) => i.state === 'manual') : [];
  const errors = report ? report.items.filter((i) => i.state === 'error') : [];

  return (
    <>
      <PageHeading
        title="Instalace a diagnostika"
        subtitle="Kontrola a založení datové struktury aplikace na SharePointu"
        action={
          <DefaultButton
            iconProps={{ iconName: 'Refresh' }}
            text="Zkontrolovat znovu"
            onClick={runDiagnose}
            disabled={!!progress}
          />
        }
      />

      {dataSource === 'mock' && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Web part běží v ukázkovém režimu, takže se nic nekontroluje ani nezakládá.
          Pro skutečnou instalaci přepněte ve vlastnostech web partu zdroj dat na
          „Ostrá data ze SharePointu“.
        </MessageBar>
      )}

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}

      {finished && !error && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setFinished(false)}>
          Instalace doběhla. Níže je výsledek kontroly — všechno, co zůstalo červené,
          vyžaduje zásah správce Microsoft 365.
        </MessageBar>
      )}

      {progress && (
        <div style={{ margin: '16px 0' }}>
          <ProgressIndicator
            label="Zakládám datovou strukturu"
            description={progress.step}
            percentComplete={progress.total > 0 ? progress.done / progress.total : undefined}
          />
          <p style={{ color: RES.gray, fontSize: 12 }}>
            Nezavírejte prosím stránku. Založení všech seznamů trvá zpravidla 1–3 minuty.
          </p>
        </div>
      )}

      {!report && !error && !progress && <Spinner size={SpinnerSize.large} label="Kontroluji…" />}

      {report && (
        <>
          <SchemaStatus report={report} />

          {missing.length > 0 && !progress && (
            <div style={{ margin: '16px 0' }}>
              <PrimaryButton
                iconProps={{ iconName: 'Installation' }}
                text={`Doplnit chybějící části (${missing.length})`}
                onClick={() => setConfirmOpen(true)}
                disabled={!report.canManageWeb || dataSource === 'mock'}
              />
              {!report.canManageWeb && (
                <span style={{ marginLeft: 12, color: RES.red, fontSize: 13 }}>
                  Nemáte oprávnění zakládat seznamy na tomto webu.
                </span>
              )}
            </div>
          )}

          {missing.length === 0 && manual.length === 0 && errors.length === 0 && !progress && (
            <MessageBar messageBarType={MessageBarType.success}>
              Datová struktura je kompletní. Není co doplňovat.
            </MessageBar>
          )}

          {manual.length > 0 && (
            <Section title="Vyžaduje správce Microsoft 365" items={manual} />
          )}
          {errors.length > 0 && <Section title="Chyby" items={errors} />}
          <Section
            title="Seznamy a knihovny"
            items={report.items.filter((i) => i.state === 'ok' || i.state === 'missing')}
          />
        </>
      )}

      <Dialog
        hidden={!confirmOpen}
        onDismiss={() => setConfirmOpen(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Doplnit datovou strukturu?',
          subText:
            'Průvodce založí chybějící seznamy, sloupce a indexy. Existující data ani ' +
            'nastavení se nijak nezmění — průvodce nikdy nic nemaže ani nepřepisuje. ' +
            'Akci lze bez rizika spustit opakovaně.'
        }}
      >
        <DialogFooter>
          <PrimaryButton onClick={runInstall} text="Doplnit" />
          <DefaultButton onClick={() => setConfirmOpen(false)} text="Zrušit" />
        </DialogFooter>
      </Dialog>
    </>
  );
};

const SchemaStatus: React.FC<{ report: DiagnosticReport }> = ({ report }) => {
  const notInstalled = report.installedSchemaVersion === 0;
  const outdated =
    !notInstalled && report.installedSchemaVersion < report.codeSchemaVersion;

  return (
    <div
      style={{
        background: RES.white,
        border: `1px solid ${RES.grayBlue}`,
        borderRadius: 4,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        fontSize: 13
      }}
    >
      <span>
        <strong>Verze aplikace:</strong> {report.codeSchemaVersion}
      </span>
      <span>
        <strong>Verze dat na SharePointu:</strong>{' '}
        {notInstalled ? 'neinstalováno' : report.installedSchemaVersion}
      </span>
      {outdated && (
        <span style={{ color: RES.amber, fontWeight: 600 }}>
          Data jsou starší než aplikace — spusťte doplnění.
        </span>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; items: DiagnosticItem[] }> = ({ title, items }) => (
  <section style={{ marginTop: 20 }}>
    <h2 style={{ fontSize: 15, fontWeight: 600, color: RES.navy, margin: '0 0 8px' }}>
      {title} <span style={{ color: RES.gray, fontWeight: 400 }}>({items.length})</span>
    </h2>
    <div style={{ background: RES.white, border: `1px solid ${RES.grayBlue}`, borderRadius: 4 }}>
      {items.map((item) => (
        <Item key={item.key} item={item} />
      ))}
    </div>
  </section>
);

const STATE_STYLE: Record<DiagnosticItem['state'], { icon: string; color: string }> = {
  ok: { icon: 'CompletedSolid', color: RES.greenDark },
  missing: { icon: 'AddTo', color: RES.amber },
  manual: { icon: 'ContactInfo', color: RES.blue },
  error: { icon: 'StatusErrorFull', color: RES.red }
};

const Item: React.FC<{ item: DiagnosticItem }> = ({ item }) => {
  const style = STATE_STYLE[item.state];
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 14px',
        borderBottom: `1px solid ${RES.background}`,
        alignItems: 'flex-start'
      }}
    >
      <Icon iconName={style.icon} style={{ color: style.color, fontSize: 14, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: RES.text }}>{item.label}</div>
        <div style={{ fontSize: 12, color: RES.gray, lineHeight: 1.5 }}>{item.detail}</div>
      </div>
    </div>
  );
};
