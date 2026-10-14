/**
 * Dialogy Servisu: lokalita, soubor, požadavek, servisní list a obecný dialog s komentářem.
 */

import * as React from 'react';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { TextField } from '@fluentui/react/lib/TextField';
import { Toggle } from '@fluentui/react/lib/Toggle';

import { RES } from '../../ui/theme';
import { Partner, PartnerType } from '../../core/types';
import { DEVICE_KINDS, ServiceDevice, ServiceSite, nextDeviceNumber, nextSiteNumber, validateDeviceNumber, validateSiteNumber } from '../../core/service';
import { REQUEST_KINDS, REQUEST_PRIORITIES, ServiceJob, ServiceRequest } from '../../core/serviceJobs';
import { ServiceDeviceInput, ServiceJobInput, ServiceRequestInput, ServiceSiteInput } from '../../data/repositories';
import { LocationPicker } from '../map/LocationPicker';
import { DATE_INPUT, dateToInput, inputToDate } from './serviceUi';

const ROW: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };

/** Dialog se zprávou o chybě a tlačítky; sdílená kostra. */
const Shell: React.FC<{ title: string; subText?: string; error?: string; busy: boolean; confirm: string; onConfirm: () => void; onClose: () => void; width?: number; children: React.ReactNode }> = ({ title, subText, error, busy, confirm, onConfirm, onClose, width, children }) => (
  <Dialog hidden={false} onDismiss={busy ? undefined : onClose} dialogContentProps={{ type: DialogType.normal, title, subText }} modalProps={{ isBlocking: true }} minWidth={width ?? 560}>
    {error && (
      <MessageBar messageBarType={MessageBarType.error} isMultiline>
        {error}
      </MessageBar>
    )}
    {children}
    <DialogFooter>
      <PrimaryButton text={busy ? 'Ukládám…' : confirm} disabled={busy} onClick={onConfirm} />
      <DefaultButton text="Zrušit" disabled={busy} onClick={onClose} />
    </DialogFooter>
  </Dialog>
);

const customerOptions = (partners: Partner[]): IDropdownOption[] =>
  [{ key: 0, text: '— bez vazby na partnera —' }, ...partners.filter((p) => p.isActive && (p.partnerType === PartnerType.Zakaznik || p.partnerType === PartnerType.Oboji)).map((p) => ({ key: p.id, text: p.name }))];

/** Spustí uložení a ukáže případnou chybu v dialogu. */
function useSave(onSaved: () => void): { busy: boolean; error?: string; run: (job: () => Promise<unknown>) => void } {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const run = (job: () => Promise<unknown>): void => {
    setBusy(true);
    setError(undefined);
    job()
      .then(() => {
        setBusy(false);
        onSaved();
      })
      .catch((e: unknown) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      });
  };
  return { busy, error, run };
}

// --- lokalita ---------------------------------------------------------------------

export const SiteDialog: React.FC<{ site?: ServiceSite; sites: ServiceSite[]; partners: Partner[]; save: (input: ServiceSiteInput) => Promise<unknown>; onSaved: () => void; onClose: () => void }> = ({ site, sites, partners, save, onSaved, onClose }) => {
  const [number, setNumber] = React.useState(site ? site.number : nextSiteNumber(sites.map((s) => s.number)));
  const [name, setName] = React.useState(site ? site.name : '');
  const [customerId, setCustomerId] = React.useState<number>(site && site.customerId ? site.customerId : 0);
  const [address, setAddress] = React.useState(site ? site.address ?? '' : '');
  const [latitude, setLatitude] = React.useState<number | undefined>(site ? site.latitude : undefined);
  const [longitude, setLongitude] = React.useState<number | undefined>(site ? site.longitude : undefined);
  const [contact, setContact] = React.useState(site ? site.contact ?? '' : '');
  const [note, setNote] = React.useState(site ? site.note ?? '' : '');
  const [folderUrl, setFolderUrl] = React.useState(site ? site.folderUrl ?? '' : '');
  const [isActive, setActive] = React.useState(site ? site.isActive : true);
  const { busy, error, run } = useSave(onSaved);
  const numberProblem = validateSiteNumber(number, sites.map((s) => s.number), site ? site.number : undefined);

  return (
    <Shell
      title={site ? `Lokalita ${site.number}` : 'Nová lokalita'}
      subText="Lokalita je místo zákazníka; pod ní se zakládají soubory (FVE, BESS…), každé se svým číslem, smlouvou a fakturací."
      error={error}
      busy={busy}
      confirm="Uložit"
      onClose={onClose}
      onConfirm={() => {
        const partner = partners.filter((p) => p.id === customerId)[0];
        run(() => save({ id: site ? site.id : undefined, number, name, customerId: partner ? partner.id : undefined, customerName: partner ? partner.name : site ? site.customerName : undefined, address: address.trim() || undefined, latitude, longitude, contact: contact.trim() || undefined, note: note.trim() || undefined, folderUrl: folderUrl.trim() || undefined, isActive }));
      }}
    >
      <div style={ROW}>
        <TextField label="Číslo lokality" required value={number} onChange={(_, v) => setNumber(v ?? '')} errorMessage={numberProblem || undefined} description="Po desítkách: 10500, 10510…" styles={{ root: { width: 150 } }} />
        <TextField label="Název lokality" required value={name} onChange={(_, v) => setName(v ?? '')} styles={{ root: { flex: '1 1 260px' } }} />
      </div>
      <Dropdown label="Zákazník" selectedKey={customerId} options={customerOptions(partners)} onChange={(_, o) => o && setCustomerId(Number(o.key))} />
      <LocationPicker
        label="Adresa (podle ní se hledá místo na mapě)"
        value={{ location: address, latitude, longitude }}
        onChange={(v) => {
          setAddress(v.location);
          setLatitude(v.latitude);
          setLongitude(v.longitude);
        }}
      />
      <TextField label="Kontakt na lokalitě" multiline rows={2} value={contact} onChange={(_, v) => setContact(v ?? '')} />
      <TextField label="Složka lokality (odkaz)" value={folderUrl} onChange={(_, v) => setFolderUrl(v ?? '')} description="Odkaz na složku v knihovně Dokumenty (02_SERVIS)." />
      <TextField label="Poznámka" multiline rows={2} value={note} onChange={(_, v) => setNote(v ?? '')} />
      <Toggle label="Aktivní" inlineLabel checked={isActive} onChange={(_, v) => setActive(!!v)} />
    </Shell>
  );
};

// --- soubor ---------------------------------------------------------------------

export const DeviceDialog: React.FC<{ site: ServiceSite; device?: ServiceDevice; devices: ServiceDevice[]; save: (input: ServiceDeviceInput) => Promise<unknown>; onSaved: () => void; onClose: () => void }> = ({ site, device, devices, save, onSaved, onClose }) => {
  const used = devices.map((d) => d.number);
  const [number, setNumber] = React.useState(device ? device.number : nextDeviceNumber(site.number, used) ?? '');
  const [name, setName] = React.useState(device ? device.name : '');
  const [kind, setKind] = React.useState(device ? device.kind : 'FVE');
  const [place, setPlace] = React.useState(site.address ?? '');
  const [latitude, setLatitude] = React.useState<number | undefined>(device ? device.latitude : undefined);
  const [longitude, setLongitude] = React.useState<number | undefined>(device ? device.longitude : undefined);
  const [from, setFrom] = React.useState(dateToInput(device ? device.contractFrom : undefined));
  const [to, setTo] = React.useState(dateToInput(device ? device.contractTo : undefined));
  const [contractNote, setContractNote] = React.useState(device ? device.contractNote ?? '' : '');
  const [contractUrl, setContractUrl] = React.useState(device ? device.contractUrl ?? '' : '');
  const [folderUrl, setFolderUrl] = React.useState(device ? device.folderUrl ?? '' : '');
  const [isActive, setActive] = React.useState(device ? device.isActive : true);
  const { busy, error, run } = useSave(onSaved);
  const check = validateDeviceNumber(number, site.number, used, device ? device.number : undefined);

  return (
    <Shell
      title={device ? `Soubor ${device.number}` : `Nový soubor v lokalitě ${site.number} ${site.name}`}
      subText={device ? undefined : 'Soubor je servisní zakázka: má vlastní číslo, složku, objednávky a fakturaci. V přehledu projektů se neukazuje.'}
      error={error}
      busy={busy}
      confirm="Uložit"
      onClose={onClose}
      onConfirm={() =>
        run(() =>
          save({
            id: device ? device.id : undefined,
            number,
            siteNumber: site.number,
            name,
            kind,
            latitude,
            longitude,
            customerName: site.customerName,
            contractFrom: inputToDate(from),
            contractTo: inputToDate(to),
            contractNote: contractNote.trim() || undefined,
            contractUrl: contractUrl.trim() || undefined,
            folderUrl: folderUrl.trim() || undefined,
            isActive
          })
        )
      }
    >
      <div style={ROW}>
        <TextField label="Číslo souboru" required value={number} disabled={!!device} onChange={(_, v) => setNumber(v ?? '')} errorMessage={check.error || undefined} description={check.warning || `Rozsah lokality: ${parseInt(site.number, 10) + 1}–${parseInt(site.number, 10) + 9}`} styles={{ root: { width: 190 } }} />
        <TextField label="Název souboru" required value={name} onChange={(_, v) => setName(v ?? '')} styles={{ root: { flex: '1 1 240px' } }} />
        <Dropdown label="Druh" selectedKey={kind} options={DEVICE_KINDS.map((k) => ({ key: k, text: k }))} onChange={(_, o) => o && setKind(String(o.key))} styles={{ root: { width: 150 } }} />
      </div>
      <div style={{ fontWeight: 600, margin: '10px 0 2px', color: RES.navy }}>Poloha na mapě (nepovinná)</div>
      <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>Bez vlastní polohy se soubor ukáže na poloze lokality.</div>
      <LocationPicker
        label="Místo souboru"
        value={{ location: place, latitude, longitude }}
        onChange={(v) => {
          setPlace(v.location);
          setLatitude(v.latitude);
          setLongitude(v.longitude);
        }}
      />
      <div style={{ fontWeight: 600, margin: '10px 0 2px', color: RES.navy }}>Servisní smlouva</div>
      <div style={{ fontSize: 12, color: RES.gray, marginBottom: 4 }}>Smlouva (komerční podmínky) je dokument uložený u lokality; zde je jen platnost, odkaz a poznámka.</div>
      <div style={ROW}>
        <label style={{ fontSize: 14 }}>
          <div>Platnost od</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={DATE_INPUT} />
        </label>
        <label style={{ fontSize: 14 }}>
          <div>Platnost do</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={DATE_INPUT} />
        </label>
      </div>
      <TextField label="Odkaz na dokument smlouvy" value={contractUrl} onChange={(_, v) => setContractUrl(v ?? '')} />
      <TextField label="Poznámka ke smlouvě (paušál, reakční doba…)" multiline rows={2} value={contractNote} onChange={(_, v) => setContractNote(v ?? '')} />
      <TextField label="Složka souboru (odkaz)" value={folderUrl} onChange={(_, v) => setFolderUrl(v ?? '')} description="Odkaz na složku souboru v knihovně Dokumenty." />
      <Toggle label="Aktivní" inlineLabel checked={isActive} onChange={(_, v) => setActive(!!v)} />
    </Shell>
  );
};

// --- požadavek --------------------------------------------------------------------

export const RequestDialog: React.FC<{ request?: ServiceRequest; sites: ServiceSite[]; devices: ServiceDevice[]; defaultSite?: string; save: (input: ServiceRequestInput) => Promise<unknown>; onSaved: () => void; onClose: () => void }> = ({ request, sites, devices, defaultSite, save, onSaved, onClose }) => {
  const [siteNumber, setSiteNumber] = React.useState(request ? request.siteNumber : defaultSite ?? (sites[0] ? sites[0].number : ''));
  const [deviceNumber, setDeviceNumber] = React.useState(request && request.deviceNumber ? request.deviceNumber : '');
  const [title, setTitle] = React.useState(request ? request.title : '');
  const [description, setDescription] = React.useState(request ? request.description ?? '' : '');
  const [priority, setPriority] = React.useState(request ? request.priority : 'Běžná');
  const [kind, setKind] = React.useState(request ? request.kind : 'Porucha');
  const [reportedBy, setReportedBy] = React.useState(request ? request.reportedBy ?? '' : '');
  const [note, setNote] = React.useState(request ? request.note ?? '' : '');
  const { busy, error, run } = useSave(onSaved);
  const siteDevices = devices.filter((d) => d.siteNumber === siteNumber && d.isActive);

  return (
    <Shell
      title={request ? `Požadavek ${request.number}` : 'Nový servisní požadavek'}
      error={error}
      busy={busy}
      confirm="Uložit"
      onClose={onClose}
      onConfirm={() => run(() => save({ id: request ? request.id : undefined, siteNumber, deviceNumber: deviceNumber || undefined, title, description: description.trim() || undefined, priority, kind, reportedBy: reportedBy.trim() || undefined, note: note.trim() || undefined }))}
    >
      <div style={ROW}>
        <Dropdown
          label="Lokalita"
          required
          selectedKey={siteNumber}
          options={sites.filter((s) => s.isActive).map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))}
          onChange={(_, o) => {
            if (o) {
              setSiteNumber(String(o.key));
              setDeviceNumber('');
            }
          }}
          styles={{ root: { flex: '1 1 240px' } }}
        />
        <Dropdown label="Soubor" selectedKey={deviceNumber} options={[{ key: '', text: '— celá lokalita —' }, ...siteDevices.map((d) => ({ key: d.number, text: `${d.number} ${d.name}` }))]} onChange={(_, o) => o && setDeviceNumber(String(o.key))} styles={{ root: { flex: '1 1 240px' } }} />
      </div>
      <TextField label="Stručně" required value={title} onChange={(_, v) => setTitle(v ?? '')} />
      <TextField label="Popis" multiline rows={4} value={description} onChange={(_, v) => setDescription(v ?? '')} />
      <div style={ROW}>
        <Dropdown label="Druh" selectedKey={kind} options={REQUEST_KINDS.map((k) => ({ key: k, text: k }))} onChange={(_, o) => o && setKind(String(o.key))} styles={{ root: { flex: '1 1 200px' } }} />
        <Dropdown label="Priorita" selectedKey={priority} options={REQUEST_PRIORITIES.map((k) => ({ key: k, text: k }))} onChange={(_, o) => o && setPriority(String(o.key))} styles={{ root: { flex: '1 1 140px' } }} />
        <TextField label="Nahlásil (kontakt u zákazníka)" value={reportedBy} onChange={(_, v) => setReportedBy(v ?? '')} styles={{ root: { flex: '1 1 220px' } }} />
      </div>
      <TextField label="Poznámka" multiline rows={2} value={note} onChange={(_, v) => setNote(v ?? '')} />
    </Shell>
  );
};

// --- servisní list ----------------------------------------------------------------

export const JobDialog: React.FC<{
  job?: ServiceJob;
  request?: ServiceRequest;
  sites: ServiceSite[];
  devices: ServiceDevice[];
  partners: Partner[];
  save: (input: ServiceJobInput) => Promise<unknown>;
  onSaved: () => void;
  onClose: () => void;
}> = ({ job, request, sites, devices, partners, save, onSaved, onClose }) => {
  const startDevice = job ? job.deviceNumber : request && request.deviceNumber ? request.deviceNumber : '';
  const startSite = job ? job.siteNumber : request ? request.siteNumber : '';
  const [siteNumber, setSiteNumber] = React.useState(startSite || (sites[0] ? sites[0].number : ''));
  const [deviceNumber, setDeviceNumber] = React.useState(startDevice);
  const [title, setTitle] = React.useState(job ? job.title : request ? request.title : '');
  const [description, setDescription] = React.useState(job ? job.description ?? '' : request ? request.description ?? '' : '');
  const [supplierId, setSupplierId] = React.useState<number>(job && job.supplierId ? job.supplierId : 0);
  const [planned, setPlanned] = React.useState(dateToInput(job ? job.plannedDate : undefined));
  const { busy, error, run } = useSave(onSaved);
  const siteDevices = devices.filter((d) => d.siteNumber === siteNumber && d.isActive);
  const suppliers = partners.filter((p) => p.isActive && (p.partnerType === PartnerType.Dodavatel || p.partnerType === PartnerType.Oboji));

  return (
    <Shell
      title={job ? `Servisní list ${job.number}` : 'Nový servisní list'}
      subText={request ? `K požadavku ${request.number}: ${request.title}` : undefined}
      error={error}
      busy={busy}
      confirm={job ? 'Uložit' : 'Založit servisní list'}
      onClose={onClose}
      onConfirm={() => {
        const supplier = suppliers.filter((p) => p.id === supplierId)[0];
        run(() => save({ id: job ? job.id : undefined, requestId: job ? job.requestId : request ? request.id : undefined, siteNumber, deviceNumber, title, description: description.trim() || undefined, plannedDate: inputToDate(planned), supplierId: supplier ? supplier.id : undefined, supplierName: supplier ? supplier.name : undefined }));
      }}
    >
      <div style={ROW}>
        <Dropdown
          label="Lokalita"
          required
          selectedKey={siteNumber}
          disabled={!!job || !!request}
          options={sites.filter((s) => s.isActive).map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))}
          onChange={(_, o) => {
            if (o) {
              setSiteNumber(String(o.key));
              setDeviceNumber('');
            }
          }}
          styles={{ root: { flex: '1 1 240px' } }}
        />
        <Dropdown label="Soubor" required selectedKey={deviceNumber || undefined} placeholder="Vyberte soubor" disabled={!!job} options={siteDevices.map((d) => ({ key: d.number, text: `${d.number} ${d.name}` }))} onChange={(_, o) => o && setDeviceNumber(String(o.key))} styles={{ root: { flex: '1 1 240px' } }} />
      </div>
      <TextField label="Název" required value={title} onChange={(_, v) => setTitle(v ?? '')} />
      <TextField label="Zadání práce pro dodavatele" multiline rows={4} value={description} onChange={(_, v) => setDescription(v ?? '')} />
      <div style={ROW}>
        <Dropdown label="Dodavatel" selectedKey={supplierId} options={[{ key: 0, text: '— zatím nevybrán —' }, ...suppliers.map((p) => ({ key: p.id, text: p.name }))]} onChange={(_, o) => o && setSupplierId(Number(o.key))} styles={{ root: { flex: '1 1 300px' } }} />
        <label style={{ fontSize: 14 }}>
          <div>Plánovaný termín</div>
          <input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} style={DATE_INPUT} />
        </label>
      </div>
    </Shell>
  );
};

// --- obecný dialog s komentářem ----------------------------------------------------

export const CommentDialog: React.FC<{ title: string; subText?: string; label: string; required: boolean; confirm: string; onConfirm: (comment: string) => Promise<unknown>; onSaved: () => void; onClose: () => void }> = ({ title, subText, label, required, confirm, onConfirm, onSaved, onClose }) => {
  const [text, setText] = React.useState('');
  const { busy, error, run } = useSave(onSaved);
  return (
    <Shell title={title} subText={subText} error={error} busy={busy} confirm={confirm} onClose={onClose} onConfirm={() => run(() => onConfirm(text))} width={520}>
      <TextField label={label} required={required} multiline rows={3} value={text} onChange={(_, v) => setText(v ?? '')} />
    </Shell>
  );
};
