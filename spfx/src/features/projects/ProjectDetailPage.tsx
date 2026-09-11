/**
 * Detail zakázky.
 *
 * Fáze 0: záložka Přehled se základními údaji. Ostatní záložky (rozpočet,
 * cashflow, harmonogram, objednávky, fakturace, dokumenty) přibývají po fázích.
 */

import * as React from 'react';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { BudgetBadge, StatusBadge } from '../../ui/components/StatusBadge';
import { ComingSoonPage } from '../../ui/components/ComingSoonPage';
import { Project } from '../../core/types';
import { formatDate, formatMoney } from '../../core/format';

export const ProjectDetailPage: React.FC<{ projectNumber?: string }> = ({ projectNumber }) => {
  const { repos } = useApp();
  const [project, setProject] = React.useState<Project | undefined | null>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!projectNumber) {
      setProject(null);
      return undefined;
    }
    let cancelled = false;
    setProject(undefined);
    repos.projects
      .getByNumber(projectNumber)
      .then((p) => {
        if (!cancelled) {
          setProject(p || null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repos, projectNumber]);

  if (error) {
    return (
      <MessageBar messageBarType={MessageBarType.error} isMultiline>
        {error}
      </MessageBar>
    );
  }
  if (project === undefined) {
    return <Spinner size={SpinnerSize.large} label="Načítám zakázku…" />;
  }
  if (project === null) {
    return (
      <MessageBar messageBarType={MessageBarType.warning} isMultiline>
        Zakázka nebyla nalezena. Mohla být přečíslovaná, nebo na ni nemáte oprávnění. Vraťte se
        prosím na <Link href="#/zakazky">seznam zakázek</Link>.
      </MessageBar>
    );
  }

  return (
    <>
      <PageHeading
        title={`${project.projectNumber} · ${project.shortName || project.title}`}
        subtitle={project.title}
        action={
          project.folderUrl ? (
            <DefaultButton
              iconProps={{ iconName: 'FolderHorizontal' }}
              text="Otevřít složku zakázky"
              href={project.folderUrl}
              target="_blank"
            />
          ) : undefined
        }
      />

      <Pivot>
        <PivotItem headerText="Přehled" itemIcon="Info">
          <Overview project={project} />
        </PivotItem>
        <PivotItem headerText="Realizační rozpočet" itemIcon="Table">
          <ComingSoonPage
            title="Realizační rozpočet"
            phase="Fáze 3"
            description="Editovatelná tabulka rozpočtu, verze a schválení baseline, semafor, import z Excelu."
          />
        </PivotItem>
        <PivotItem headerText="Cashflow" itemIcon="Money">
          <ComingSoonPage
            title="Cashflow zakázky"
            phase="Fáze 3"
            description="Měsíční plán příjmů a výdajů zakázky, plán proti skutečnosti."
          />
        </PivotItem>
        <PivotItem headerText="Harmonogram" itemIcon="TimelineProgress">
          <ComingSoonPage
            title="Harmonogram"
            phase="Fáze 4"
            description="Gantt se závislostmi, kritickou cestou a baseline. Posun dodávky posune platby v cashflow."
          />
        </PivotItem>
        <PivotItem headerText="Objednávky" itemIcon="ShoppingCart">
          <ComingSoonPage
            title="Objednávky zakázky"
            phase="Fáze 2"
            description="Nákupní objednávky této zakázky včetně schvalování a PDF v grafice RES."
          />
        </PivotItem>
        <PivotItem headerText="Fakturace" itemIcon="M365InvoicingLogo">
          <ComingSoonPage
            title="Fakturace"
            phase="Fáze 2"
            description="Podklady pro fakturaci a plán fakturačních milníků."
          />
        </PivotItem>
        <PivotItem headerText="Dokumenty" itemIcon="DocumentSet">
          <ComingSoonPage
            title="Dokumenty"
            phase="Fáze 2"
            description="Předávací protokoly a další číslované dokumenty, plus poslední změněné soubory ve složce zakázky."
          />
        </PivotItem>
      </Pivot>
    </>
  );
};

const Overview: React.FC<{ project: Project }> = ({ project }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 16,
      marginTop: 16
    }}
  >
    <Card title="Základní údaje">
      <Row label="Číslo zakázky" value={project.projectNumber} />
      <Row label="Stav" value={<StatusBadge status={project.status} />} />
      <Row label="Typ" value={project.projectType || '—'} />
      <Row label="Zákazník" value={project.customerName || '—'} />
      <Row label="Lokalita" value={project.location || '—'} />
      <Row label="Projektový manažer" value={project.projectManagerName || '—'} />
    </Card>

    <Card title="Finance">
      <Row label="Cena bez DPH" value={formatMoney(project.contractPriceNet, project.currency)} />
      <Row
        label="Rozpočet"
        value={
          <BudgetBadge
            status={project.budgetStatus}
            baseline={project.budgetBaselineTotal}
            forecast={project.costForecastTotal}
          />
        }
      />
      <Row label="Schválený rozpočet" value={formatMoney(project.budgetBaselineTotal)} />
      <Row label="Prognóza nákladů" value={formatMoney(project.costForecastTotal)} />
      <Row label="Marže" value={<Later note="Fáze 3" />} />
      <Row label="Vyfakturováno a uhrazeno" value={<Later note="Fáze 2" />} />
    </Card>

    <Card title="Termíny">
      <Row label="Zahájení" value={formatDate(project.startDate)} />
      <Row label="Ukončení plánované" value={formatDate(project.endDatePlanned)} />
      <Row label="Ukončení skutečné" value={formatDate(project.endDateActual)} />
      <Row label="Nejbližší smluvní termín" value={formatDate(project.nextDeadline)} />
    </Card>
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section
    style={{
      background: RES.white,
      border: `1px solid ${RES.grayBlue}`,
      borderRadius: 4,
      padding: '14px 18px'
    }}
  >
    <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: RES.navy }}>{title}</h2>
    {children}
  </section>
);

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      padding: '5px 0',
      borderBottom: `1px solid ${RES.background}`,
      fontSize: 13
    }}
  >
    <span style={{ color: RES.gray }}>{label}</span>
    <span style={{ textAlign: 'right', color: RES.text }}>{value}</span>
  </div>
);

const Later: React.FC<{ note: string }> = ({ note }) => (
  <span style={{ color: RES.gray, fontStyle: 'italic', fontSize: 12 }}>doplní {note}</span>
);
