/**
 * Detail projektu.
 *
 * Fáze 0: záložka Přehled se základními údaji. Ostatní záložky (rozpočet,
 * cashflow, harmonogram, objednávky, fakturace, dokumenty) přibývají po fázích.
 */

import * as React from 'react';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { ActionButton, DefaultButton, IconButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { IContextualMenuItem } from '@fluentui/react/lib/ContextualMenu';
import { Link } from '@fluentui/react/lib/Link';

import { useApp } from '../../ui/AppContext';
import { buildHash, navigate, RouteName } from '../../ui/router';
import { RES } from '../../ui/theme';
import { PageHeading } from '../../ui/components/PageHeading';
import { BudgetBadge, StatusBadge } from '../../ui/components/StatusBadge';
import { ComingSoonPage } from '../../ui/components/ComingSoonPage';
import { Project } from '../../core/types';
import { formatDate, formatMoney } from '../../core/format';
import { canDeleteProject, canEditProject } from '../../core/roles';
import { canManageProjectAccess } from '../../core/projectAccess';
import { EditProjectPanel } from './EditProjectPanel';
import { DeadlinesTab } from './DeadlinesTab';
import { DocumentsTab } from './DocumentsTab';
import { AccessBar } from './AccessBar';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { ProjectFoldersDialog } from './ProjectFoldersDialog';
import { ProjectReportDialog } from '../reports/ProjectReportDialog';
import { ProjectOverviewDialog } from '../reports/ProjectOverviewDialog';
import { EXTERNAL_LINK_PROPS } from '../../ui/components/ExternalLink';
import { ProjectOrdersTab } from '../orders/ProjectOrdersTab';
import { ProjectInvoicesTab } from '../invoicing/ProjectInvoicesTab';
import { ProjectDiaryTab } from '../diary/ProjectDiaryTab';
import { ProjectHandoverTab } from '../diary/ProjectHandoverTab';
import { BudgetTab } from '../budget/BudgetTab';
import { CashflowTab } from '../cashflow/CashflowTab';
import { ProjectPhotos } from '../photos/ProjectPhotos';

export const ProjectDetailPage: React.FC<{ projectNumber?: string }> = ({ projectNumber }) => {
  const { repos, user } = useApp();
  const [project, setProject] = React.useState<Project | undefined | null>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [overviewOpen, setOverviewOpen] = React.useState(false);
  const [foldersDialog, setFoldersDialog] = React.useState(false);
  const [overheadBusy, setOverheadBusy] = React.useState(false);
  const [foldersMessage, setFoldersMessage] = React.useState<{ ok: boolean; text: string } | undefined>(undefined);

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
    return <Spinner size={SpinnerSize.large} label="Načítám projekt…" />;
  }
  if (project === null) {
    return (
      <MessageBar messageBarType={MessageBarType.warning} isMultiline>
        Projekt nebyl nalezen. Mohl být přečíslovaný, nebo na něj nemáte oprávnění. Vraťte se
        prosím na <Link href="#/projekty">seznam projektů</Link>.
      </MessageBar>
    );
  }

  const mayEdit = canEditProject(user.roles, user.loginName, {
    projectManagerLogin: project.projectManagerLogin,
    assistantLogins: project.assistantLogins
  });

  /** Režie: založí složku `99900-Režie/<rok>` se šablonou Režie a nastaví odkaz na ni. Hledá tolerantně, zakládá jen to, co chybí. */
  const createOverheadFolders = (): void => {
    setOverheadBusy(true);
    setFoldersMessage(undefined);
    repos.projects
      .retryCreateFolders(project.projectNumber)
      .then(() => repos.projects.getByNumber(project.projectNumber))
      .then((p) => {
        if (p) {
          setProject(p);
        }
        setOverheadBusy(false);
        setFoldersMessage({ ok: true, text: 'Složky Režie jsou založené a odkaz „Otevřít složku projektu“ míří na složku Režie.' });
      })
      .catch((e: Error) => {
        setOverheadBusy(false);
        setFoldersMessage({ ok: false, text: e.message });
      });
  };

  /** Nastavení projektu (ozubené kolečko): sem patří to, co projektový manažer nepotřebuje denně. */
  const settingsItems: IContextualMenuItem[] = [];
  if (mayEdit) {
    settingsItems.push({
      key: 'folders',
      text: 'Složky projektu…',
      title: 'Kde má projekt složky objednávek, fakturace, zápisů a fotek; kontrola odkazu na složku (nic se nemaže ani nepřesouvá)',
      iconProps: { iconName: 'FabricFolderConfirm' },
      onClick: () => setFoldersDialog(true)
    });
  }
  if (project.isOverhead && canManageProjectAccess(user.roles)) {
    settingsItems.push({
      key: 'overheadFolders',
      text: overheadBusy ? 'Zakládám složky Režie…' : 'Založit složky Režie',
      title: 'Založí složku Režie (99900-Režie/rok) podle šablony Režie z Nastavení a nastaví odkaz na ni. Nic nemaže.',
      iconProps: { iconName: 'NewFolder' },
      disabled: overheadBusy,
      onClick: createOverheadFolders
    });
  }
  if (canDeleteProject(user.roles) && !project.isOverhead) {
    settingsItems.push({ key: 'divider', itemType: 1 }); // oddělovač
    settingsItems.push({
      key: 'delete',
      text: 'Smazat projekt…',
      iconProps: { iconName: 'Delete', style: { color: RES.red } },
      style: { color: RES.red },
      onClick: () => setDeleteOpen(true)
    });
  }

  return (
    <>
      <ActionButton
        iconProps={{ iconName: 'Back' }}
        text="Zpět na seznam projektů"
        href={buildHash(RouteName.Dashboard)}
        styles={{ root: { marginBottom: 4, paddingLeft: 0 } }}
      />
      <PageHeading
        title={`${project.projectNumber} · ${project.shortName || project.title}`}
        subtitle={project.title}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            {mayEdit && (
              <PrimaryButton
                iconProps={{ iconName: 'Edit' }}
                text="Upravit projekt"
                onClick={() => setEditOpen(true)}
              />
            )}
            {!project.isOverhead && (
              <DefaultButton
                iconProps={{ iconName: 'PDF' }}
                text="Report projektu"
                title="PDF se stavem projektu ve stylu RES prezentace"
                onClick={() => setReportOpen(true)}
              />
            )}
            {!project.isOverhead && mayEdit && (
              <DefaultButton
                iconProps={{ iconName: 'ReportDocument' }}
                text="Project overview"
                title="Marketingový přehled realizace pro zákazníky (PDF, česky nebo anglicky)"
                onClick={() => setOverviewOpen(true)}
              />
            )}
            {project.folderUrl && (
              <DefaultButton
                iconProps={{ iconName: 'FolderHorizontal' }}
                text="Otevřít složku projektu"
                href={project.folderUrl}
                {...EXTERNAL_LINK_PROPS}
              />
            )}
            {settingsItems.length > 0 && (
              <IconButton
                iconProps={{ iconName: 'Settings' }}
                title="Nastavení projektu"
                ariaLabel="Nastavení projektu"
                menuProps={{ items: settingsItems }}
                styles={{ root: { height: 32, width: 32, border: `1px solid ${RES.grayBlue}`, borderRadius: 2 } }}
              />
            )}
          </div>
        }
      />

      {foldersMessage && (
        <MessageBar messageBarType={foldersMessage.ok ? MessageBarType.success : MessageBarType.error} isMultiline onDismiss={() => setFoldersMessage(undefined)}>
          {foldersMessage.text}
        </MessageBar>
      )}

      {foldersDialog && (
        <ProjectFoldersDialog
          project={project}
          onClose={() => setFoldersDialog(false)}
          onProjectUpdated={(p) => setProject(p)}
          onSaved={(p) => {
            setProject(p);
            setFoldersDialog(false);
            setFoldersMessage({ ok: true, text: 'Složky projektu jsou uložené.' });
          }}
        />
      )}

      {reportOpen && <ProjectReportDialog project={project} onClose={() => setReportOpen(false)} />}
      {overviewOpen && <ProjectOverviewDialog project={project} onClose={() => setOverviewOpen(false)} />}

      {deleteOpen && (
        <DeleteProjectDialog
          project={project}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            navigate(RouteName.Dashboard);
          }}
        />
      )}

      {project.isOverhead && canManageProjectAccess(user.roles) && <AccessBar project={project} />}

      {mayEdit && (
        <EditProjectPanel
          isOpen={editOpen}
          project={project}
          onDismiss={() => setEditOpen(false)}
          onSaved={(updated) => setProject(updated)}
        />
      )}

      {/* Záložky jsou menší a při nedostatku místa se zalomí do druhé řady (nic se neschovává do nabídky „…“); nejdůležitější jsou první. */}
      <Pivot
        aria-label="Části projektu"
        styles={{
          root: { display: 'flex', flexWrap: 'wrap', rowGap: 0, whiteSpace: 'normal' },
          link: { fontSize: 13, height: 34, lineHeight: '34px', padding: '0 8px', marginRight: 2 },
          linkIsSelected: { fontSize: 13, height: 34, lineHeight: '34px', padding: '0 8px', marginRight: 2 },
          icon: { fontSize: 13, marginRight: 4 }
        }}
      >
        <PivotItem headerText="Přehled" itemIcon="Info">
          <Overview project={project} />
        </PivotItem>
        <PivotItem headerText="Objednávky" itemIcon="ShoppingCart">
          <ProjectOrdersTab project={project} />
        </PivotItem>
        <PivotItem headerText="Fakturace" itemIcon="M365InvoicingLogo">
          <ProjectInvoicesTab project={project} />
        </PivotItem>
        <PivotItem headerText="Stavební deník" itemIcon="Dictionary">
          <ProjectDiaryTab project={project} />
        </PivotItem>
        <PivotItem headerText="Předávací protokoly" itemIcon="DocumentApproval">
          <ProjectHandoverTab project={project} />
        </PivotItem>
        <PivotItem headerText="Fotodokumentace" itemIcon="Camera">
          <ProjectPhotos project={project} />
        </PivotItem>
        <PivotItem headerText="Dokumenty" itemIcon="DocumentSet">
          <DocumentsTab project={project} />
        </PivotItem>
        <PivotItem headerText="Termíny" itemIcon="Clock">
          <DeadlinesTab
            project={project}
            onChanged={() => {
              // Změna termínu přepočítá nejbližší termín projektu — načti ho znovu,
              // aby ho záložka Přehled ukazovala aktuální.
              repos.projects
                .getByNumber(project.projectNumber)
                .then((p) => p && setProject(p))
                .catch(() => {
                  // Detail zůstane se starou hodnotou; termíny samotné jsou uložené.
                });
            }}
          />
        </PivotItem>
        <PivotItem headerText="Realizační rozpočet" itemIcon="Table">
          <BudgetTab project={project} />
        </PivotItem>
        <PivotItem headerText="Cashflow" itemIcon="Money">
          <CashflowTab project={project} />
        </PivotItem>
        <PivotItem headerText="Harmonogram" itemIcon="TimelineProgress">
          <ComingSoonPage
            title="Harmonogram"
            phase="Fáze 4"
            description="Gantt se závislostmi, kritickou cestou a baseline. Posun dodávky posune platby v cashflow."
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
      <Row label="Číslo projektu" value={project.projectNumber} />
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
