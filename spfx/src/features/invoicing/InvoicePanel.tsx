/**
 * Podklad pro fakturaci v postranním panelu: nový, úprava konceptu, zobrazení a akce (kontrola, předání účtárně,
 * číslo faktury, úhrada, storno), náhled PDF a odeslání účtárně e-mailem.
 *
 * Co smí člověk udělat, rozhoduje `core/invoiceWorkflow` (tlačítka se podle něj jen nabízejí);
 * skutečná kontrola oprávnění znovu probíhá v datové vrstvě při zápisu.
 *
 * Okna (náhled, odeslání, komentář) jsou uvnitř panelu — jinak by klik v nich panel považoval za klik „ven" a zavřel se.
 */

import { UserSignature, signatureOf } from '../../core/signatures';
import { folderFor } from '../../core/projectFolders';
import * as React from 'react';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { TextField } from '@fluentui/react/lib/TextField';
import { ComboBox } from '@fluentui/react/lib/ComboBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { PrimaryButton, DefaultButton, IconButton, ActionButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Link } from '@fluentui/react/lib/Link';

import { DocumentFolderButton } from '../../ui/components/DocumentFolderButton';
import { ApproveButton, ReturnButton } from '../../ui/components/ApprovalButtons';
import { PanelMessages } from '../../ui/components/PanelMessages';
import { removeConceptCopy, saveConceptCopy } from '../documents/conceptCopy';
import { useApp } from '../../ui/AppContext';
import { useFormDraft } from '../../ui/useFormDraft';
import { DraftBanner } from '../../ui/components/DraftBanner';
import { draftKey } from '../../core/drafts';
import { RES } from '../../ui/theme';
import { CS_CALENDAR_STRINGS } from '../../ui/csCalendarStrings';
import { useAutoRefresh } from '../../ui/useAutoRefresh';
import { ExternalLink } from '../../ui/components/ExternalLink';
import { buildHash, RouteName } from '../../ui/router';
import { Currency, Partner, Project } from '../../core/types';
import { formatDate, formatDateTime, formatMoney, parseAmount, parseCzechDate } from '../../core/format';
import { OrderAttachment, OrderLine, lineTotalNet } from '../../core/orders';
import {
  INVOICE_KIND_CHOICES,
  InvoiceBasis,
  InvoiceKind,
  InvoiceStatus,
  dueDateFrom,
  invoiceKindOf,
  invoiceTotals,
  isOverdue,
  paymentDays,
  validateInvoiceDraft
} from '../../core/invoiceBases';
import {
  InvoiceAction,
  availableInvoiceActions,
  canCheckInvoice,
  canIssueInvoice
} from '../../core/invoiceWorkflow';
import { toActor, toWorkflowProject } from '../../core/orderWorkflow';
import { canAddInvoiceAttachment } from '../../core/invoiceWorkflow';
import { DiaryEntry, EntryStatus, HANDOVER_RESULT_LABELS, entryFileName, protocolNumber } from '../../core/siteDiary';
import { AttachmentsSection } from '../orders/AttachmentsSection';
import { defaultInvoiceMail } from '../../core/mail';
import { invoiceCheckMail, invoiceCheckRecipients, invoiceReturnedMail, orderLink, personRecipient } from '../../core/orderNotify';
import { RoleMembership } from '../../core/userAdmin';
import { MailAttachment, InvoiceHistoryEntry, InvoiceInput } from '../../data/repositories';
import { CurrencyCode, StoredRates, describeRates, effectiveRates, toCzk } from '../../core/currency';
import { fallbackRatesOf } from '../../core/settings';
import { OrderPdfPreview } from '../orders/OrderPdfPreview';
import { SendOrderDialog, SendPayload } from '../orders/SendOrderDialog';
import { Row, Section, TotalsBox } from '../orders/OrderPanel';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { invoicePdfData, invoicePdfFileName, renderInvoicePdf } from './invoicePdf';

export interface InvoicePanelProps {
  isOpen: boolean;
  /** Existující podklad; bez něj se zakládá nový. */
  invoiceId?: number;
  /** U nového podkladu předvybraný projekt (např. z detailu projektu). */
  projectNumber?: string;
  onDismiss: () => void;
  /** Podklad se změnil — seznam za panelem se má načíst znovu. */
  onChanged: () => void;
}

interface LineForm {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

const emptyLine = (): LineForm => ({ description: '', quantity: '1', unit: 'kpl', unitPrice: '' });

type DialogKind = 'return' | 'cancel' | 'invoiced' | 'paid';

const VAT_OPTIONS: IDropdownOption[] = [
  { key: 21, text: '21 %' },
  { key: 12, text: '12 %' },
  { key: 0, text: '0 % (bez DPH / přenesená povinnost)' }
];
const CURRENCY_OPTIONS: IDropdownOption[] = [
  { key: 'CZK', text: 'CZK' },
  { key: 'EUR', text: 'EUR' },
  { key: 'USD', text: 'USD' }
];

const KIND_OPTIONS: IDropdownOption[] = INVOICE_KIND_CHOICES.map((k) => ({ key: k, text: k }));

const DEFAULT_DAYS = 30;

const today = (): Date => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

export const InvoicePanel: React.FC<InvoicePanelProps> = ({ isOpen, invoiceId, projectNumber, onDismiss, onChanged }) => {
  const { repos, settings, user } = useApp();
  const actor = React.useMemo(() => toActor(user), [user]);

  const [loading, setLoading] = React.useState(false);
  const [invoice, setInvoice] = React.useState<InvoiceBasis | undefined>(undefined);
  const [history, setHistory] = React.useState<InvoiceHistoryEntry[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [storedRates, setStoredRates] = React.useState<StoredRates>({});
  const [roleMembers, setRoleMembers] = React.useState<RoleMembership[]>([]);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<{ text: string; type: MessageBarType } | undefined>(undefined);
  const [dialog, setDialog] = React.useState<{ kind: DialogKind; text: string; date?: Date } | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewBlob, setPreviewBlob] = React.useState<Blob | undefined>(undefined);
  const [sendOpen, setSendOpen] = React.useState<'handover' | 'resend' | undefined>(undefined);
  const [sendError, setSendError] = React.useState<string | undefined>(undefined);
  const [attachments, setAttachments] = React.useState<OrderAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  /** Uzavřené a podepsané předávací protokoly projektu — nabízejí se jako příloha. */
  const [protocols, setProtocols] = React.useState<DiaryEntry[]>([]);

  const [fProject, setFProject] = React.useState<string | undefined>(undefined);
  /** Ručně zvolený odběratel a objednatel; bez hodnoty platí zákazník projektu. */
  const [fCustomerPick, setFCustomerPick] = React.useState<{ id?: number; name: string } | undefined>(undefined);
  const [fOrdererPick, setFOrdererPick] = React.useState<{ id?: number; name: string } | undefined>(undefined);
  const [fLines, setFLines] = React.useState<LineForm[]>([emptyLine()]);
  const [fVat, setFVat] = React.useState(21);
  const [fCurrency, setFCurrency] = React.useState<Currency>('CZK');
  const [fKind, setFKind] = React.useState<InvoiceKind>(InvoiceKind.Faktura);
  const [fIssue, setFIssue] = React.useState<Date | undefined>(today());
  const [fTaxable, setFTaxable] = React.useState<Date | undefined>(today());
  const [fDays, setFDays] = React.useState(String(DEFAULT_DAYS));
  const [fNote, setFNote] = React.useState('');

  const fillForm = (inv: InvoiceBasis | undefined, preset: string | undefined): void => {
    setFProject(inv ? inv.projectNumber : preset);
    const projCustomer = projects.filter((p) => p.projectNumber === (inv ? inv.projectNumber : preset))[0]?.customerName;
    setFCustomerPick(inv && inv.customerName && inv.customerName !== projCustomer ? { id: inv.customerId, name: inv.customerName } : undefined);
    setFOrdererPick(inv && inv.ordererName && inv.ordererName !== projCustomer ? { name: inv.ordererName } : undefined);
    setFLines(
      inv && inv.lines.length > 0
        ? inv.lines.map((l) => ({
            description: l.description,
            quantity: String(l.quantity).replace('.', ','),
            unit: l.unit ?? '',
            unitPrice: String(l.unitPriceNet).replace('.', ',')
          }))
        : [emptyLine()]
    );
    setFVat(inv ? inv.vatRate : 21);
    setFCurrency((inv?.currency as Currency) || 'CZK');
    setFKind(inv ? invoiceKindOf(inv) : InvoiceKind.Faktura);
    setFIssue(inv ? inv.issueDate : today());
    setFTaxable(inv ? inv.taxableDate : today());
    const days = inv ? paymentDays(inv.issueDate, inv.dueDate) : undefined;
    setFDays(String(days !== undefined ? days : DEFAULT_DAYS));
    setFNote(inv?.note ?? '');
  };

  // Načtení dat při otevření panelu.
  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setError(undefined);
    setIssues([]);
    setNotice(undefined);
    setDialog(undefined);
    setBusy(false);
    setLoading(true);
    setInvoice(undefined);
    setHistory([]);
    setPreviewOpen(false);
    setSendOpen(undefined);
    setAttachments([]);
    setPendingFiles([]);
    setProtocols([]);

    Promise.all([
      repos.projects.list({}),
      repos.partners.list({}),
      invoiceId !== undefined ? repos.invoices.getById(invoiceId) : Promise.resolve(undefined),
      repos.rates.getLatest().catch((): StoredRates => ({})),
      repos.userAdmin.listRoleMembers(settings.roles).catch((): RoleMembership[] => [])
    ])
      .then(([projectList, partnerList, loaded, ratesList, membersList]) => {
        if (cancelled) {
          return;
        }
        setProjects(projectList);
        setPartners(partnerList);
        setStoredRates(ratesList);
        setRoleMembers(membersList);
        setInvoice(loaded);
        fillForm(loaded, projectNumber);
        setEditing(invoiceId === undefined);
        setLoading(false);
        if (invoiceId !== undefined && !loaded) {
          setError('Podklad nebyl nalezen. Nejspíš ho někdo smazal, nebo k němu nemáte oprávnění.');
        }
        if (loaded) {
          repos.invoices
            .history(loaded.id)
            .then((h) => !cancelled && setHistory(h))
            .catch(() => undefined);
          repos.invoices
            .listAttachments(loaded.id)
            .then((a) => !cancelled && setAttachments(a))
            .catch(() => undefined);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setLoading(false);
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, invoiceId, projectNumber, repos]);

  const currentProjectNumber = invoice ? invoice.projectNumber : fProject;
  const project = projects.filter((p) => p.projectNumber === currentProjectNumber)[0];
  const workflowProject = React.useMemo(() => (project ? toWorkflowProject(project) : undefined), [project]);

  const issuableProjects = React.useMemo(
    () => projects.filter((p) => canIssueInvoice(toWorkflowProject(p), actor)),
    [projects, actor]
  );
  const projectOptions: IDropdownOption[] = (invoice ? projects : issuableProjects)
    .slice()
    .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber, 'cs-CZ', { numeric: true }))
    .map((p) => ({ key: p.projectNumber, text: `${p.projectNumber} · ${p.shortName || p.title}` }));

  // Zákazník podkladu = zákazník projektu; údaje o něm (adresa, IČO, splatnost) se berou z partnerů.
  const formProject = projects.filter((p) => p.projectNumber === fProject)[0];
  const projectCustomerName = formProject ? formProject.customerName : undefined;
  const customerName = fCustomerPick ? fCustomerPick.name : projectCustomerName;
  const customer = customerName ? partners.filter((p) => p.name === customerName)[0] : undefined;
  const ordererName = fOrdererPick ? fOrdererPick.name : projectCustomerName;
  const partyOf = (name: string | undefined): { name: string; address?: string; ico?: string; dic?: string; email?: string } | undefined => {
    if (!name) {
      return undefined;
    }
    const p = partners.filter((x) => x.name === name)[0];
    return { name, address: p ? p.address : undefined, ico: p ? p.ico : undefined, dic: p ? p.dic : undefined, email: p ? p.email : undefined };
  };
  const partnerOptions: IDropdownOption[] = partners
    .filter((p) => p.isActive)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'cs-CZ'))
    .map((p) => ({ key: p.id, text: p.name }));
  const pickPartner = (id: number | string | undefined): { id: number; name: string } | undefined => {
    const p = partners.filter((x) => x.id === id)[0];
    return p ? { id: p.id, name: p.name } : undefined;
  };

  const buildLines = (): OrderLine[] =>
    fLines
      .filter((l) => l.description.trim() !== '' || l.unitPrice.trim() !== '')
      .map((l) => ({
        description: l.description,
        quantity: parseAmount(l.quantity) ?? 0,
        unit: l.unit.trim() || undefined,
        unitPriceNet: parseAmount(l.unitPrice) ?? 0
      }));

  const dueFromForm = (): Date | undefined => {
    const days = parseAmount(fDays);
    return fIssue && days !== undefined ? dueDateFrom(fIssue, days) : undefined;
  };

  const buildInput = (): InvoiceInput => ({
    projectNumber: fProject ?? '',
    kind: fKind,
    customerId: customer ? customer.id : fCustomerPick ? fCustomerPick.id : undefined,
    customerName,
    ordererName,
    lines: buildLines(),
    vatRate: fVat,
    currency: fCurrency,
    issueDate: fIssue,
    taxableDate: fTaxable,
    dueDate: dueFromForm(),
    note: fNote.trim() || undefined
  });

  const rates = effectiveRates(storedRates, fallbackRatesOf(settings.approvals));
  const actions: InvoiceAction[] = invoice && workflowProject ? availableInvoiceActions(invoice, workflowProject, actor) : [];
  const mayCheck = !!workflowProject && canCheckInvoice(workflowProject, actor);

  const afterChange = (saved: InvoiceBasis): void => {
    setInvoice(saved);
    setBusy(false);
    onChanged();
    repos.invoices
      .history(saved.id)
      .then(setHistory)
      .catch(() => undefined);
  };

  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';

  /** Provede změnu a po ní (nepovinně) upozorní e-mailem. Selhání e-mailu změnu nezruší, jen se ukáže. */
  const run = (action: () => Promise<InvoiceBasis>, after?: (saved: InvoiceBasis) => Promise<void>): void => {
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    action()
      .then((o) => {
        afterChange(o);
        if (after) {
          after(o).catch(() => undefined);
        }
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  /** E-mail PM, že podklad čeká na jeho kontrolu. */
  const notifyChecker = async (saved: InvoiceBasis): Promise<void> => {
    const p = projects.filter((x) => x.projectNumber === saved.projectNumber)[0];
    if (!p) {
      return;
    }
    const recipients = invoiceCheckRecipients(saved.requestedByLogin, toWorkflowProject(p), roleMembers);
    if (recipients.length === 0) {
      setNotice({
        text: 'Podklad čeká na kontrolu, ale projektovému manažerovi se nepodařilo poslat upozornění e-mailem (nenašla se jeho adresa). Řekněte mu to prosím sami.',
        type: MessageBarType.warning
      });
      return;
    }
    const mail = invoiceCheckMail({
      number: saved.number,
      projectNumber: saved.projectNumber,
      projectName: p.shortName || p.title,
      customerName: saved.customerName,
      amountText: formatMoney(saved.amountNet, saved.currency),
      requesterName: saved.requestedByName,
      link: orderLink(pageUrl, RouteName.Invoicing, saved.id),
      companyName: settings.company.name
    });
    try {
      await repos.mail.send({ to: recipients.map((r) => r.email), subject: mail.subject, bodyText: mail.body, attachments: [] });
      setNotice({ text: `Kontrolor byl upozorněn e-mailem: ${recipients.map((r) => r.name).join(', ')}.`, type: MessageBarType.success });
    } catch (e) {
      setNotice({
        text: `Podklad čeká na kontrolu, ale e-mail kontrolorovi se nepodařilo odeslat (${why(e)}). Řekněte mu to prosím sami.`,
        type: MessageBarType.warning
      });
    }
  };

  /** E-mail vystaviteli, že podklad byl vrácen k úpravě. */
  const notifyReturned = (comment: string): ((saved: InvoiceBasis) => Promise<void>) => async (saved: InvoiceBasis): Promise<void> => {
    if (saved.requestedByLogin.toLowerCase() === user.loginName.toLowerCase()) {
      return;
    }
    const requester = personRecipient(saved.requestedByLogin, saved.requestedByName, roleMembers);
    if (!requester) {
      return;
    }
    const mail = invoiceReturnedMail({
      number: saved.number,
      decidedBy: user.displayName,
      comment: comment.trim() || undefined,
      link: orderLink(pageUrl, RouteName.Invoicing, saved.id),
      companyName: settings.company.name
    });
    try {
      await repos.mail.send({ to: [requester.email], subject: mail.subject, bodyText: mail.body, attachments: [] });
      setNotice({ text: `Vystavitel (${requester.name}) byl upozorněn e-mailem.`, type: MessageBarType.success });
    } catch (e) {
      setNotice({ text: `Podklad je vrácený, ale e-mail vystaviteli se nepodařilo odeslat (${why(e)}).`, type: MessageBarType.warning });
    }
  };

  /** Koncept PDF (KO) do složky projektu — podklad se do složky ukládá už při uložení konceptu. Na pozadí; selhání se ukáže upozorněním. */
  const saveConcept = (saved: InvoiceBasis): void => {
    const proj = projects.filter((p) => p.projectNumber === saved.projectNumber)[0];
    if (!proj || !proj.folderUrl) {
      return;
    }
    const partner = saved.customerName ? partners.filter((p) => p.name === saved.customerName)[0] : undefined;
    const data = invoicePdfData(
      saved,
      proj.shortName || proj.title,
      {
        name: partner ? partner.name : saved.customerName || '—',
        address: partner ? partner.address : undefined,
        ico: partner ? partner.ico : undefined,
        dic: partner ? partner.dic : undefined,
        email: partner ? partner.email : undefined
      },
      settings.company,
      undefined,
      partyOf(saved.ordererName)
    );
    renderInvoicePdf(data)
      .then((blob) => saveConceptCopy(repos.documents, proj, folderFor(proj, 'invoices', settings.folders), invoicePdfFileName(saved.number), blob))
      .catch((e: unknown) =>
        setNotice({
          text: `Podklad je uložený, ale koncept PDF (KO) se do složky projektu nepodařilo uložit: ${why(e)}`,
          type: MessageBarType.warning
        })
      );
  };

  // Rozepsaný podklad se průběžně ukládá do prohlížeče — když uživatel odskočí jinam a vrátí se, nabídne se obnovení.
  const draftValue = React.useMemo(() => ({ fProject, fCustomerPick, fOrdererPick, fLines, fVat, fCurrency, fKind, fIssue, fTaxable, fDays, fNote }), [fProject, fCustomerPick, fOrdererPick, fLines, fVat, fCurrency, fKind, fIssue, fTaxable, fDays, fNote]);
  const draft = useFormDraft({
    key: isOpen ? draftKey(user.loginName, 'invoice', invoice ? invoice.id : invoiceId !== undefined ? invoiceId : `new-${projectNumber || ''}`) : undefined,
    value: draftValue,
    active: isOpen && !loading && editing,
    onRestore: (d) => {
      setFProject(d.fProject);
      setFCustomerPick(d.fCustomerPick);
      setFOrdererPick(d.fOrdererPick);
      setFLines(d.fLines);
      setFVat(d.fVat);
      setFCurrency(d.fCurrency);
      setFKind(d.fKind);
      setFIssue(d.fIssue);
      setFTaxable(d.fTaxable);
      setFDays(d.fDays);
      setFNote(d.fNote);
    }
  });

  const save = async (thenSubmit: boolean): Promise<void> => {
    const input = buildInput();
    const found = validateInvoiceDraft(input, thenSubmit);
    if (found.length > 0) {
      setIssues(found.map((i) => i.message));
      return;
    }
    setIssues([]);
    setError(undefined);
    setBusy(true);
    try {
      const saved = invoice ? await repos.invoices.update(invoice.id, input, user) : await repos.invoices.create(input, user);
      // Hned po uložení si podklad pamatujeme — kdyby selhalo předání, další pokus koncept upraví, nezaloží druhý.
      setInvoice(saved);
      draft.clear();
      onChanged();
      const failedFiles = await uploadPending(saved.id);
      afterChange(saved);
      setEditing(false);
      saveConcept(saved);
      if (failedFiles.length > 0) {
        setError(`Podklad je uložený, ale tyto přílohy se nenahrály — ${failedFiles.join(' | ')}`);
      } else if (thenSubmit) {
        if (mayCheck) {
          setSendError(undefined);
          setSendOpen('handover');
        } else {
          run(() => repos.invoices.submit(saved.id, user), notifyChecker);
        }
      }
    } catch (e) {
      setBusy(false);
      setError(why(e));
    }
  };

  // --- přílohy ---

  const reloadAttachments = (id: number): void => {
    repos.invoices
      .listAttachments(id)
      .then(setAttachments)
      .catch(() => undefined);
  };

  /** Nahraje soubory čekající na uložení nového podkladu. Nepovedený soubor nezdrží ostatní; o chybách se řekne. */
  const uploadPending = async (id: number): Promise<string[]> => {
    const failed: string[] = [];
    for (const file of pendingFiles) {
      try {
        await repos.invoices.addAttachment(id, file, user);
      } catch (e) {
        failed.push(`${file.name}: ${why(e)}`);
      }
    }
    setPendingFiles([]);
    if (pendingFiles.length > 0) {
      reloadAttachments(id);
    }
    return failed;
  };

  const addFiles = (files: File[]): void => {
    if (!invoice) {
      setPendingFiles((cur) => [...cur, ...files]);
      return;
    }
    setError(undefined);
    setBusy(true);
    (async (): Promise<void> => {
      const failed: string[] = [];
      for (const file of files) {
        try {
          await repos.invoices.addAttachment(invoice.id, file, user);
        } catch (e) {
          failed.push(`${file.name}: ${why(e)}`);
        }
      }
      reloadAttachments(invoice.id);
      setBusy(false);
      if (failed.length > 0) {
        setError(failed.join(' | '));
      }
    })().catch(() => setBusy(false));
  };

  const removeSavedAttachment = (name: string): void => {
    if (!invoice) {
      return;
    }
    setError(undefined);
    setBusy(true);
    repos.invoices
      .removeAttachment(invoice.id, name, user)
      .then(() => {
        reloadAttachments(invoice.id);
        setBusy(false);
      })
      .catch((e: Error) => {
        setBusy(false);
        setError(e.message);
      });
  };

  // Předávací protokoly projektu, které jdou připojit (uzavřené nebo podepsané — mají PDF).
  const protocolProject = invoice ? invoice.projectNumber : fProject;
  React.useEffect(() => {
    if (!isOpen || !protocolProject) {
      return undefined;
    }
    let cancelled = false;
    repos.diary
      .listEntries({ projectNumber: protocolProject, kind: 'predani' })
      .then((list) => !cancelled && setProtocols(list.filter((e) => e.status === EntryStatus.Uzavreno || e.status === EntryStatus.Podepsano)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [repos, isOpen, protocolProject]);

  /** Připojí PDF hotového předávacího protokolu (kopie — podklad drží stav protokolu z okamžiku připojení). */
  const attachProtocol = (entry: DiaryEntry): void => {
    const name = entryFileName(entry.projectNumber, entry.entryNo, 'pdf', entry.kind);
    if (attachments.some((a) => a.name === name) || pendingFiles.some((f) => f.name === name)) {
      setError(`Protokol ${protocolNumber(entry.projectNumber, entry.entryNo)} je už přiložený.`);
      return;
    }
    if (!project) {
      return;
    }
    setError(undefined);
    setBusy(true);
    repos.documents
      .readProjectFile(project, entry.folderPath, name)
      .then((blob) => {
        setBusy(false);
        addFiles([new File([blob], name, { type: 'application/pdf' })]);
      })
      .catch((e: unknown) => {
        setBusy(false);
        setError(`PDF protokolu ${protocolNumber(entry.projectNumber, entry.entryNo)} se nepodařilo načíst ze složky projektu: ${why(e)}`);
      });
  };

  /** Přílohy a nabídka předávacích protokolů — ve formuláři i v detailu podkladu. */
  const attachmentsBlock = (hideTitle: boolean): JSX.Element => (
    <>
      <AttachmentsSection
        hideTitle={hideTitle}
        attachments={attachments}
        pending={pendingFiles}
        canAdd={!invoice || (!!project && canAddInvoiceAttachment(invoice, toWorkflowProject(project), actor))}
        canRemove={!invoice || (!!project && canAddInvoiceAttachment(invoice, toWorkflowProject(project), actor))}
        busy={busy}
        onAdd={addFiles}
        onRemoveSaved={removeSavedAttachment}
        onRemovePending={(i) => setPendingFiles((cur) => cur.filter((_, idx) => idx !== i))}
      />
      {(!invoice || (!!project && canAddInvoiceAttachment(invoice, toWorkflowProject(project), actor))) && (
        <Dropdown
          ariaLabel="Připojit předávací protokol"
          placeholder={protocols.length > 0 ? 'Připojit předávací protokol projektu…' : 'Projekt nemá uzavřený předávací protokol'}
          disabled={busy || protocols.length === 0}
          options={protocols.map((e) => ({
            key: e.id,
            text: `${protocolNumber(e.projectNumber, e.entryNo)} · ${formatDate(e.date)}${e.handover && e.handover.result ? ' · ' + HANDOVER_RESULT_LABELS[e.handover.result] : ''}`
          }))}
          selectedKey={null}
          onChange={(_, o) => {
            const found = protocols.filter((e) => e.id === o?.key)[0];
            if (found) {
              attachProtocol(found);
            }
          }}
          styles={{ root: { maxWidth: 520, marginTop: 6 } }}
        />
      )}
    </>
  );

  // --- náhled PDF a odeslání účtárně ---

  /**
   * `asStatus` — v jakém stavu se PDF vykreslí. Při předání účtárně se PDF dělá ještě ve stavu před předáním; ostrý doklad ale nemá nést vodoznak
   * „NÁHLED – NEPŘEDÁNO“, proto se tehdy vykreslí, jako by už byl předaný.
   */
  const pdfSource = (asStatus?: InvoiceStatus): ReturnType<typeof invoicePdfData> => {
    const inv0: InvoiceBasis =
      editing || !invoice
        ? {
            id: invoice ? invoice.id : 0,
            number: invoice ? invoice.number : 'NÁVRH',
            kind: fKind,
            projectNumber: fProject ?? '',
            customerName,
            ordererName,
            lines: buildLines(),
            amountNet: invoiceTotals(buildLines(), fVat).net,
            vatRate: fVat,
            currency: fCurrency,
            issueDate: fIssue,
            taxableDate: fTaxable,
            dueDate: dueFromForm(),
            status: invoice ? invoice.status : InvoiceStatus.Koncept,
            requestedByName: invoice ? invoice.requestedByName : user.displayName,
            requestedByLogin: invoice ? invoice.requestedByLogin : user.loginName,
            note: fNote.trim() || undefined
          }
        : invoice;
    const inv: InvoiceBasis = asStatus ? { ...inv0, status: asStatus } : inv0;
    const partner = inv.customerName ? partners.filter((p) => p.name === inv.customerName)[0] : undefined;
    return invoicePdfData(
      inv,
      project ? project.shortName || project.title : '',
      {
        name: partner ? partner.name : inv.customerName || '—',
        address: partner ? partner.address : undefined,
        ico: partner ? partner.ico : undefined,
        dic: partner ? partner.dic : undefined,
        email: partner ? partner.email : undefined
      },
      settings.company,
      undefined,
      partyOf(inv.ordererName)
    );
  };

  /** Ostrý doklad (bez vodoznaku) dostane podpisové pole vystavitele se značkou elektronického podpisu a obrázkem podpisu z profilu (když ho má). */
  const withSignature = async (data: ReturnType<typeof invoicePdfData>): Promise<ReturnType<typeof invoicePdfData>> => {
    if (data.watermark) {
      return data;
    }
    const login = invoice ? invoice.requestedByLogin : user.loginName;
    const sigs = await repos.profiles.getSignatures([login]).catch((): Record<string, UserSignature> => ({}));
    return {
      ...data,
      signatures: [{ label: 'Vystavil', name: data.requestedByName, at: invoice && invoice.handoverDate ? invoice.handoverDate : new Date(), image: signatureOf(sigs, login) }]
    };
  };

  const openPreview = (): void => {
    setError(undefined);
    setPreviewBlob(undefined);
    setPreviewOpen(true);
    withSignature(pdfSource())
      .then(renderInvoicePdf)
      .then(setPreviewBlob)
      .catch((e: Error) => {
        setPreviewOpen(false);
        setError(`Náhled se nepodařilo vytvořit: ${e.message}`);
      });
  };

  /**
   * Předání účtárně: vytvoří PDF, uloží ho do složky projektu (04_Fakturace), (volitelně) pošle e-mail a teprve potom
   * zapíše předání. Kdyby e-mail selhal, podklad zůstane ve stavu před předáním a jde to zkusit znovu.
   */
  const runSend = async (payload: SendPayload | undefined, again: boolean): Promise<void> => {
    if (!invoice || !project) {
      setSendError('Projekt podkladu nebyl nalezen.');
      return;
    }
    setBusy(true);
    setSendError(undefined);
    let stage = 'Vytvoření PDF';
    let mailSent = false;
    try {
      const alreadyHandedOver = invoice.status === InvoiceStatus.Predano || invoice.status === InvoiceStatus.Vyfakturovano || invoice.status === InvoiceStatus.Uhrazeno;
      const blob = await renderInvoicePdf(await withSignature(pdfSource(alreadyHandedOver ? undefined : InvoiceStatus.Predano)));
      const fileName = invoicePdfFileName(invoice.number);
      stage = 'Uložení PDF do složky projektu';
      let pdfUrl: string | undefined;
      try {
        pdfUrl = await repos.documents.saveProjectFile(project, folderFor(project, 'invoices', settings.folders), fileName, blob);
      } catch (e) {
        if (!again) {
          throw e;
        }
        pdfUrl = invoice.pdfUrl;
      }
      if (payload) {
        stage = 'Odeslání e-mailu';
        const files: MailAttachment[] = [{ name: fileName, contentType: 'application/pdf', content: blob }];
        if (payload.includeAttachments) {
          for (const a of attachments) {
            files.push({ name: a.name, contentType: 'application/octet-stream', content: await repos.invoices.readAttachment(invoice.id, a.name) });
          }
        }
        await repos.mail.send({ to: payload.to, cc: payload.cc, subject: payload.subject, bodyText: payload.body, attachments: files });
        mailSent = true;
      }
      stage = again ? 'Zápis opakovaného předání' : 'Zápis předání účtárně';
      const options = { sentTo: payload ? payload.to.join(', ') : undefined, pdfUrl };
      const updated = again ? await repos.invoices.resend(invoice.id, user, options) : await repos.invoices.handOver(invoice.id, user, options);
      // Ostrá verze je uložená — koncept (KO) už není potřeba (maže se do koše SharePointu).
      await removeConceptCopy(repos.documents, project, folderFor(project, 'invoices', settings.folders), fileName);
      setSendOpen(undefined);
      afterChange(updated);
    } catch (e) {
      setBusy(false);
      setSendError(
        `${stage} se nepodařilo: ${why(e)}` +
          (mailSent ? ' E-mail už ODEŠEL — neposílejte ho znovu, jen zapište předání (tlačítko „Jen uložit PDF a zapsat předání“).' : '')
      );
    }
  };

  const confirmDialog = (): void => {
    if (!dialog || !invoice) {
      return;
    }
    const { kind, text, date } = dialog;
    setDialog(undefined);
    if (kind === 'cancel') {
      run(() => repos.invoices.cancel(invoice.id, text, user));
    } else if (kind === 'return') {
      run(() => repos.invoices.returnToDraft(invoice.id, text, user), notifyReturned(text));
    } else if (kind === 'invoiced') {
      run(() => repos.invoices.markInvoiced(invoice.id, text, user));
    } else {
      run(() => repos.invoices.markPaid(invoice.id, date ?? today(), user));
    }
  };

  // Podklad mezitím mohl zkontrolovat, předat nebo změnit někdo jiný — otevřený detail se sám obnoví.
  const refreshInvoice = (): void => {
    if (!invoice) {
      return;
    }
    const id = invoice.id;
    const before = invoice.modified ? invoice.modified.getTime() : 0;
    repos.invoices
      .getById(id)
      .then((fresh) => {
        if (fresh && (fresh.modified ? fresh.modified.getTime() : 0) !== before) {
          setInvoice(fresh);
          repos.invoices
            .history(id)
            .then(setHistory)
            .catch(() => undefined);
          onChanged();
        }
      })
      .catch(() => undefined);
  };
  useAutoRefresh(refreshInvoice, !isOpen || !invoice || editing || busy || !!dialog || previewOpen || !!sendOpen);

  // --- zobrazení ---

  const input = buildInput();
  const totals = invoiceTotals(input.lines, fVat);
  const dueText = dueFromForm();

  const headerText = invoice
    ? `Podklad ${invoice.number}${invoiceKindOf(invoice) === InvoiceKind.Zaloha ? ' · zálohová faktura' : ''}`
    : 'Nový podklad pro fakturaci';

  const DIALOG_TEXT: Record<DialogKind, { title: string; label: string; required: boolean; confirm: string }> = {
    return: {
      title: invoice && invoice.requestedByLogin.toLowerCase() === user.loginName.toLowerCase() ? 'Stáhnout zpět do konceptu' : 'Vrátit do konceptu',
      label: invoice && invoice.requestedByLogin.toLowerCase() === user.loginName.toLowerCase() ? 'Poznámka (nepovinná)' : 'Co se má opravit?',
      required: !(invoice && invoice.requestedByLogin.toLowerCase() === user.loginName.toLowerCase()),
      confirm: 'Vrátit do konceptu'
    },
    cancel: { title: 'Stornovat podklad', label: 'Důvod storna', required: true, confirm: 'Stornovat' },
    invoiced: { title: 'Zapsat číslo faktury', label: 'Číslo faktury z účetnictví', required: true, confirm: 'Označit jako vyfakturované' },
    paid: { title: 'Zapsat úhradu', label: '', required: false, confirm: 'Označit jako uhrazené' }
  };

  const footer = (): JSX.Element | null => {
    if (loading) {
      return null;
    }
    if (editing) {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DefaultButton text={busy ? 'Ukládám…' : 'Uložit koncept'} disabled={busy} onClick={() => save(false).catch(() => undefined)} />
          <PrimaryButton
            text={mayCheck ? 'Uložit a předat účtárně' : 'Uložit a předat ke kontrole'}
            disabled={busy}
            onClick={() => save(true).catch(() => undefined)}
          />
          <DefaultButton iconProps={{ iconName: 'PDF' }} text="Náhled podkladu" disabled={busy} onClick={openPreview} />
          {invoice && (
            <DefaultButton
              text="Zrušit úpravy"
              disabled={busy}
              onClick={() => {
                fillForm(invoice, undefined);
                setIssues([]);
                setError(undefined);
                setEditing(false);
              }}
            />
          )}
        </div>
      );
    }
    if (!invoice) {
      return null;
    }
    const has = (a: InvoiceAction): boolean => actions.indexOf(a) !== -1;
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {has('edit') && <DefaultButton iconProps={{ iconName: 'Edit' }} text="Upravit" disabled={busy} onClick={() => setEditing(true)} />}
        {has('submit') && (
          <PrimaryButton text="Předat ke kontrole" disabled={busy} onClick={() => run(() => repos.invoices.submit(invoice.id, user), notifyChecker)} />
        )}
        {has('handover') && (
          <ApproveButton
            text="Předat účtárně"
            disabled={busy}
            onClick={() => {
              setSendError(undefined);
              setSendOpen('handover');
            }}
          />
        )}
        {has('return') && (
          <ReturnButton
            text={invoice.requestedByLogin.toLowerCase() === user.loginName.toLowerCase() ? 'Stáhnout zpět' : 'Vrátit do konceptu'}
            disabled={busy}
            onClick={() => setDialog({ kind: 'return', text: '' })}
          />
        )}
        {has('invoiced') && (
          <PrimaryButton text="Zapsat číslo faktury" disabled={busy} onClick={() => setDialog({ kind: 'invoiced', text: '' })} />
        )}
        {has('paid') && <PrimaryButton text="Zapsat úhradu" disabled={busy} onClick={() => setDialog({ kind: 'paid', text: '', date: today() })} />}
        {has('resend') && (
          <DefaultButton
            iconProps={{ iconName: 'Mail' }}
            text="Poslat účtárně znovu"
            disabled={busy}
            onClick={() => {
              setSendError(undefined);
              setSendOpen('resend');
            }}
          />
        )}
        {has('cancel') && <DefaultButton text="Stornovat" disabled={busy} onClick={() => setDialog({ kind: 'cancel', text: '' })} />}
        <DefaultButton iconProps={{ iconName: 'PDF' }} text="Náhled podkladu" disabled={busy} onClick={openPreview} />
      </div>
    );
  };

  const setLine = (index: number, patch: Partial<LineForm>): void =>
    setFLines((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const accountingMail = (): { subject: string; body: string } =>
    defaultInvoiceMail({
      number: invoice ? invoice.number : '',
      advance: invoice ? invoiceKindOf(invoice) === InvoiceKind.Zaloha : false,
      projectNumber: invoice ? invoice.projectNumber : '',
      projectName: project ? project.shortName || project.title : undefined,
      customerName: invoice ? invoice.customerName : undefined,
      amountText: invoice ? formatMoney(invoice.amountNet, invoice.currency) : '',
      dueDate: invoice && invoice.dueDate ? formatDate(invoice.dueDate) : undefined,
      senderName: user.displayName,
      senderEmail: user.email,
      companyName: settings.company.name
    });

  const footerNode = footer();
  // Hlášky (co chybí, co se nepovedlo) jsou nad tlačítky v patě, kde je uživatel uvidí; bez paty (načítání, nenalezeno) zůstávají nahoře.
  const footerWithMessages = footerNode ? (
    <div>
      <PanelMessages issues={issues} error={error} onDismissError={() => setError(undefined)} />
      {footerNode}
    </div>
  ) : null;

  return (
    <>
      <Panel
        isOpen={isOpen}
        onDismiss={onDismiss}
        type={PanelType.large}
        headerText={headerText}
        closeButtonAriaLabel="Zavřít"
        onRenderNavigationContent={(props, defaultRender) => (
          <>
            <DocumentFolderButton project={project} relativeFolder={folderFor(project, 'invoices', settings.folders)} />
            {defaultRender ? defaultRender(props) : null}
          </>
        )}
        isFooterAtBottom
        onRenderFooterContent={() => footerWithMessages}
      >
        {loading && <Spinner size={SpinnerSize.large} label="Načítám…" />}

        {error && !footerNode && (
          <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>
            {error}
          </MessageBar>
        )}
        {notice && (
          <MessageBar messageBarType={notice.type} isMultiline onDismiss={() => setNotice(undefined)}>
            {notice.text}
          </MessageBar>
        )}

        {!loading && editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {draft.pending && <DraftBanner savedAt={draft.pending.savedAt} what="formulář podkladu" onRestore={draft.restore} onDiscard={draft.discard} />}
            <Dropdown
              label="Druh dokladu"
              options={KIND_OPTIONS}
              selectedKey={fKind}
              onChange={(_, o) => o && setFKind(String(o.key) as InvoiceKind)}
              styles={{ root: { maxWidth: 260 } }}
            />

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Dropdown
                label="Projekt"
                required
                disabled={!!invoice}
                options={projectOptions}
                selectedKey={fProject ?? null}
                onChange={(_, o) => {
                  if (o) {
                    setFProject(String(o.key));
                    setFCustomerPick(undefined);
                    setFOrdererPick(undefined);
                    const p = projects.filter((x) => x.projectNumber === String(o.key))[0];
                    const c = p && p.customerName ? partners.filter((x) => x.name === p.customerName)[0] : undefined;
                    if (c && c.paymentTermDays !== undefined) {
                      setFDays(String(c.paymentTermDays));
                    }
                  }
                }}
                placeholder="Vyberte projekt"
                styles={{ root: { flex: '1 1 280px' } }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px' }}>
                <ComboBox
                  label="Odběratel (komu se fakturuje)"
                  required
                  allowFreeform={false}
                  autoComplete="on"
                  options={partnerOptions}
                  selectedKey={customer ? customer.id : null}
                  placeholder={fProject && !projectCustomerName ? 'Projekt nemá zákazníka — vyberte odběratele' : 'Vyberte odběratele'}
                  onChange={(_, o) => {
                    const p = o ? pickPartner(o.key as number) : undefined;
                    if (p) {
                      setFCustomerPick(p.name === projectCustomerName ? undefined : p);
                      const full = partners.filter((x) => x.id === p.id)[0];
                      if (full && full.paymentTermDays !== undefined) {
                        setFDays(String(full.paymentTermDays));
                      }
                    }
                  }}
                />
                {fCustomerPick && (
                  <Link onClick={() => setFCustomerPick(undefined)} styles={{ root: { fontSize: 12 } }}>
                    Vrátit na zákazníka projektu{projectCustomerName ? ` (${projectCustomerName})` : ''}
                  </Link>
                )}
              </div>
              <div style={{ flex: '1 1 280px' }}>
                <ComboBox
                  label="Objednatel (kdo plnění objednal)"
                  allowFreeform={false}
                  autoComplete="on"
                  options={partnerOptions}
                  selectedKey={(() => {
                    const p = ordererName ? partners.filter((x) => x.name === ordererName)[0] : undefined;
                    return p ? p.id : null;
                  })()}
                  placeholder="Vyberte objednatele"
                  onChange={(_, o) => {
                    const p = o ? pickPartner(o.key as number) : undefined;
                    if (p) {
                      setFOrdererPick(p.name === projectCustomerName ? undefined : { name: p.name });
                    }
                  }}
                />
                {fOrdererPick && (
                  <Link onClick={() => setFOrdererPick(undefined)} styles={{ root: { fontSize: 12 } }}>
                    Vrátit na zákazníka projektu{projectCustomerName ? ` (${projectCustomerName})` : ''}
                  </Link>
                )}
              </div>
            </div>
            {fProject && !customerName && (
              <MessageBar messageBarType={MessageBarType.warning}>Projekt nemá zákazníka. Vyberte odběratele ručně, nebo zákazníka doplňte v detailu projektu.</MessageBar>
            )}

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Položky</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fLines.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <TextField
                      placeholder="Popis plnění"
                      ariaLabel={`Popis položky ${i + 1}`}
                      value={l.description}
                      onChange={(_, v) => setLine(i, { description: v ?? '' })}
                      styles={{ root: { flex: '1 1 220px' } }}
                    />
                    <TextField
                      placeholder="Množství"
                      ariaLabel={`Množství položky ${i + 1}`}
                      value={l.quantity}
                      onChange={(_, v) => setLine(i, { quantity: v ?? '' })}
                      styles={{ root: { width: 80 } }}
                    />
                    <TextField
                      placeholder="Jedn."
                      ariaLabel={`Jednotka položky ${i + 1}`}
                      value={l.unit}
                      onChange={(_, v) => setLine(i, { unit: v ?? '' })}
                      styles={{ root: { width: 64 } }}
                    />
                    <TextField
                      placeholder="Cena za jednotku bez DPH"
                      ariaLabel={`Cena položky ${i + 1}`}
                      value={l.unitPrice}
                      onChange={(_, v) => setLine(i, { unitPrice: v ?? '' })}
                      styles={{ root: { width: 150 } }}
                    />
                    <div style={{ width: 110, textAlign: 'right', paddingTop: 6, fontSize: 13 }}>
                      {formatMoney(
                        lineTotalNet({ description: l.description, quantity: parseAmount(l.quantity) ?? 0, unitPriceNet: parseAmount(l.unitPrice) ?? 0 }),
                        fCurrency
                      )}
                    </div>
                    <IconButton
                      iconProps={{ iconName: 'Delete' }}
                      ariaLabel={`Odebrat položku ${i + 1}`}
                      disabled={fLines.length === 1}
                      onClick={() => setFLines((cur) => cur.filter((_, idx) => idx !== i))}
                    />
                  </div>
                ))}
              </div>
              <ActionButton iconProps={{ iconName: 'Add' }} text="Přidat položku" onClick={() => setFLines((cur) => [...cur, emptyLine()])} />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Dropdown
                label="Sazba DPH"
                options={VAT_OPTIONS}
                selectedKey={fVat}
                onChange={(_, o) => o && setFVat(Number(o.key))}
                styles={{ root: { flex: '1 1 200px' } }}
              />
              <Dropdown
                label="Měna"
                options={CURRENCY_OPTIONS}
                selectedKey={fCurrency}
                onChange={(_, o) => o && setFCurrency(String(o.key) as Currency)}
                styles={{ root: { width: 100 } }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <DatePicker
                label="Datum vystavení"
                value={fIssue}
                onSelectDate={(d) => setFIssue(d ?? undefined)}
                formatDate={(d) => (d ? formatDate(d) : '')}
                strings={CS_CALENDAR_STRINGS}
                parseDateFromString={(t) => parseCzechDate(t) ?? null}
                allowTextInput
                styles={{ root: { flex: '1 1 160px' } }}
              />
              {fKind !== InvoiceKind.Zaloha && (
                <DatePicker
                  label="DUZP"
                  value={fTaxable}
                  onSelectDate={(d) => setFTaxable(d ?? undefined)}
                  formatDate={(d) => (d ? formatDate(d) : '')}
                  strings={CS_CALENDAR_STRINGS}
                  parseDateFromString={(t) => parseCzechDate(t) ?? null}
                  allowTextInput
                  styles={{ root: { flex: '1 1 160px' } }}
                />
              )}
              <TextField
                label="Splatnost (dnů)"
                value={fDays}
                onChange={(_, v) => setFDays(v ?? '')}
                description={dueText ? `Splatné ${formatDate(dueText)}` : undefined}
                styles={{ root: { width: 140 } }}
              />
            </div>

            <TextField label="Poznámka pro účtárnu" multiline rows={2} value={fNote} onChange={(_, v) => setFNote(v ?? '')} />

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Přílohy</div>
              {attachmentsBlock(true)}
            </div>

            <TotalsBox net={totals.net} vat={totals.vat} gross={totals.gross} currency={fCurrency} vatRate={fVat} />
            {fCurrency !== 'CZK' && (
              <div style={{ alignSelf: 'flex-end', fontSize: 12, color: RES.gray, textAlign: 'right' }}>
                Bez DPH v Kč: <strong style={{ color: RES.text }}>≈ {formatMoney(toCzk(totals.net, fCurrency, rates), 'CZK')}</strong>
                <br />
                {describeRates(rates, [fCurrency as CurrencyCode])}
              </div>
            )}
            <MessageBar messageBarType={MessageBarType.info} isMultiline>
              {mayCheck
                ? 'Jako projektový manažer (nebo vedení) můžete podklad po uložení rovnou předat účtárně.'
                : 'Podklad nejdřív zkontroluje projektový manažer projektu, teprve potom ho předá účtárně.'}
            </MessageBar>
          </div>
        )}

        {!loading && !editing && invoice && (
          <InvoiceDetail invoice={invoice} history={history} projectName={project ? project.shortName || project.title : ''} rates={rates} attachmentsNode={attachmentsBlock(true)} showAttachments={attachments.length > 0 || (!!project && canAddInvoiceAttachment(invoice, toWorkflowProject(project), actor))} />
        )}

        {sendOpen && invoice && (
          <SendOrderDialog
            resend={sendOpen === 'resend'}
            texts={{
              title: sendOpen === 'resend' ? `Poslat podklad ${invoice.number} účtárně znovu` : `Předat podklad ${invoice.number} účtárně`,
              toLabel: 'Komu (účtárna)',
              pdfLabel: 'PDF podkladu',
              hint:
                sendOpen === 'resend'
                  ? `PDF se znovu uloží do složky projektu (${folderFor(project, 'invoices', settings.folders)}) a v historii bude zapsáno, komu a kdy šlo znovu. Stav podkladu se nemění. E-mail odejde z vaší schránky.`
                  : `PDF se zároveň uloží do složky projektu (${folderFor(project, 'invoices', settings.folders)}) a podklad se označí jako předaný účtárně. E-mail odejde z vaší schránky a bude i ve vaší poště Odeslané.`,
              markOnly: sendOpen === 'resend' ? 'Jen uložit PDF a zapsat předání' : 'Jen uložit PDF a označit jako předáno',
              sendButton: 'Odeslat účtárně',
              attachmentsLabel: 'Přiložit i přílohy podkladu (např. předávací protokol)'
            }}
            orderNumber={invoice.number}
            initialTo={settings.company.accountingEmail || ''}
            initialCc={user.email || ''}
            initialSubject={accountingMail().subject}
            initialBody={accountingMail().body}
            attachmentCount={attachments.length}
            busy={busy}
            error={sendError}
            onSendMail={(payload) => runSend(payload, sendOpen === 'resend').catch(() => undefined)}
            onMarkOnly={() => runSend(undefined, sendOpen === 'resend').catch(() => undefined)}
            onDismiss={() => setSendOpen(undefined)}
          />
        )}

        {previewOpen && (
          <OrderPdfPreview
            blob={previewBlob}
            fileName={invoicePdfFileName(invoice ? invoice.number : 'NAVRH')}
            title={invoice ? `Náhled podkladu ${invoice.number}` : 'Náhled podkladu (návrh)'}
            onDismiss={() => setPreviewOpen(false)}
          />
        )}

        {dialog && (
          <Dialog
            hidden={false}
            onDismiss={() => setDialog(undefined)}
            dialogContentProps={{ type: DialogType.normal, title: DIALOG_TEXT[dialog.kind].title }}
            modalProps={{ isBlocking: true }}
          >
            {dialog.kind === 'paid' ? (
              <DatePicker
                label="Datum úhrady"
                value={dialog.date}
                onSelectDate={(d) => setDialog({ ...dialog, date: d ?? undefined })}
                formatDate={(d) => (d ? formatDate(d) : '')}
                strings={CS_CALENDAR_STRINGS}
                parseDateFromString={(t) => parseCzechDate(t) ?? null}
                allowTextInput
              />
            ) : (
              <TextField
                label={DIALOG_TEXT[dialog.kind].label}
                multiline={dialog.kind !== 'invoiced'}
                rows={3}
                value={dialog.text}
                onChange={(_, v) => setDialog({ ...dialog, text: v ?? '' })}
                autoFocus
              />
            )}
            <DialogFooter>
              <PrimaryButton
                text={DIALOG_TEXT[dialog.kind].confirm}
                disabled={
                  dialog.kind === 'paid' ? !dialog.date : DIALOG_TEXT[dialog.kind].required && dialog.text.trim() === ''
                }
                onClick={confirmDialog}
              />
              <DefaultButton text="Zpět" onClick={() => setDialog(undefined)} />
            </DialogFooter>
          </Dialog>
        )}
      </Panel>
    </>
  );
};

/** Zobrazení podkladu jen ke čtení: údaje, položky, součty a historie. */
const InvoiceDetail: React.FC<{
  invoice: InvoiceBasis;
  history: InvoiceHistoryEntry[];
  projectName: string;
  rates: ReturnType<typeof effectiveRates>;
  /** Přílohy (a nabídka předávacích protokolů) připravené v panelu. */
  attachmentsNode: React.ReactNode;
  showAttachments: boolean;
}> = ({ invoice, history, projectName, rates, attachmentsNode, showAttachments }) => {
  const totals = invoiceTotals(invoice.lines, invoice.vatRate);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <InvoiceStatusBadge status={invoice.status} overdue={isOverdue(invoice)} />
      </div>

      {invoice.status === InvoiceStatus.Storno && invoice.cancelReason && (
        <MessageBar messageBarType={MessageBarType.blocked} isMultiline>
          <strong>Stornováno.</strong> {invoice.cancelReason}
        </MessageBar>
      )}
      {invoice.status === InvoiceStatus.KeKontrole && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline>
          Podklad čeká na kontrolu projektovým manažerem projektu (nebo vedením). Po kontrole ho předá účtárně.
        </MessageBar>
      )}

      <Section title="Údaje">
        <Row
          label="Projekt"
          value={
            <Link href={buildHash(RouteName.ProjectDetail, invoice.projectNumber)}>
              {invoice.projectNumber}
              {projectName ? ` · ${projectName}` : ''}
            </Link>
          }
        />
        <Row label="Odběratel" value={invoice.customerName || '—'} />
        {invoice.ordererName && invoice.ordererName !== invoice.customerName && <Row label="Objednatel" value={invoice.ordererName} />}
        <Row label="Datum vystavení" value={invoice.issueDate ? formatDate(invoice.issueDate) : '—'} />
        <Row label="Druh dokladu" value={invoiceKindOf(invoice)} />
        {invoiceKindOf(invoice) !== InvoiceKind.Zaloha && <Row label="DUZP" value={invoice.taxableDate ? formatDate(invoice.taxableDate) : '—'} />}
        <Row label="Splatnost" value={invoice.dueDate ? formatDate(invoice.dueDate) : '—'} />
        <Row label="Vystavil" value={invoice.requestedByName || '—'} />
        {invoice.handoverDate && <Row label="Předáno účtárně" value={formatDate(invoice.handoverDate)} />}
        {invoice.accountingInvoiceNo && <Row label="Faktura č." value={invoice.accountingInvoiceNo} />}
        {invoice.paidDate && <Row label="Uhrazeno dne" value={formatDate(invoice.paidDate)} />}
        {invoice.pdfUrl && <Row label="PDF podkladu" value={<ExternalLink href={invoice.pdfUrl}>otevřít v nové záložce</ExternalLink>} />}
        {invoice.note && <Row label="Poznámka" value={invoice.note} />}
      </Section>

      <Section title="Položky">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: RES.gray }}>
              <th style={{ padding: '4px 6px' }}>Popis</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Množství</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Cena/jedn.</th>
              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Celkem</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${RES.background}` }}>
                <td style={{ padding: '4px 6px' }}>{l.description}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                  {l.quantity} {l.unit || ''}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{formatMoney(l.unitPriceNet, invoice.currency)}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{formatMoney(lineTotalNet(l), invoice.currency)}</td>
              </tr>
            ))}
            {invoice.lines.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 8, color: RES.gray }}>
                  Podklad zatím nemá žádné položky.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TotalsBox net={totals.net} vat={totals.vat} gross={totals.gross} currency={invoice.currency} vatRate={invoice.vatRate} />
        {invoice.currency !== 'CZK' && (
          <div style={{ fontSize: 12, color: RES.gray, textAlign: 'right', marginTop: 4 }}>
            Bez DPH v Kč: <strong style={{ color: RES.text }}>≈ {formatMoney(toCzk(totals.net, invoice.currency, rates), 'CZK')}</strong>
            <br />
            {describeRates(rates, [invoice.currency as CurrencyCode])}
          </div>
        )}
      </Section>

      {showAttachments && <Section title="Přílohy">{attachmentsNode}</Section>}

      {history.length > 0 && (
        <Section title="Historie">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {history.map((h, i) => (
              <div key={i}>
                <strong>{h.action}</strong> — {h.byName}
                {h.at ? `, ${formatDateTime(h.at)}` : ''}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};
