/**
 * Detail servisního požadavku: údaje, SLA, přílohy (fotky, dokumenty, nákresy) a servisní listy s jejich stavem.
 * Odtud jde požadavek upravit, zamítnout, smazat (vedení a administrátor) a založit na něj servisní list.
 */

import * as React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Link } from '@fluentui/react/lib/Link';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';

import { RES } from '../../ui/theme';
import { formatDate, formatDateTime } from '../../core/format';
import { ServiceDevice, ServiceSite, jobDeletionProblem, requestDeletionProblem } from '../../core/service';
import { RequestStatus, ServiceJob, ServiceRequest } from '../../core/serviceJobs';
import { SlaRule, slaProgress } from '../../core/serviceSla';
import { Fact, JobKindBadge, JobStatusBadge, PriorityBadge, RequestStatusBadge, SlaIndicator, TD, TH } from './serviceUi';
import { ServiceAttachments } from './ServiceAttachments';

export const RequestPanel: React.FC<{
  request: ServiceRequest;
  sites: ServiceSite[];
  devices: ServiceDevice[];
  jobs: ServiceJob[];
  rules: SlaRule[];
  mayWork: boolean;
  mayDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onReject: () => void;
  onNewJob: () => void;
  onOpenJob: (jobId: number) => void;
  onDelete: () => void;
}> = ({ request, sites, devices, jobs, rules, mayWork, mayDelete, onClose, onEdit, onReject, onNewJob, onOpenJob, onDelete }) => {
  const [pending, setPending] = React.useState<File[]>([]);
  const site = sites.filter((s) => s.number === request.siteNumber)[0];
  const device = request.deviceNumber ? devices.filter((d) => d.number === request.deviceNumber)[0] : undefined;
  const own = jobs.filter((j) => j.requestId === request.id);
  const open = request.status === RequestStatus.Prijato || request.status === RequestStatus.Zpracovava;
  const canDelete = mayDelete && requestDeletionProblem(request.id, jobs) === '';

  const footer = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
      {mayWork && open && <PrimaryButton text="Založit servisní list" iconProps={{ iconName: 'Add' }} onClick={onNewJob} />}
      {mayWork && <DefaultButton text="Upravit" iconProps={{ iconName: 'Edit' }} onClick={onEdit} />}
      {mayWork && request.status === RequestStatus.Prijato && <DefaultButton text="Zamítnout" onClick={onReject} />}
      {canDelete && <DefaultButton text="Smazat" iconProps={{ iconName: 'Delete' }} onClick={onDelete} />}
      <DefaultButton text="Zavřít" onClick={onClose} />
    </div>
  );

  return (
    <Panel isOpen onDismiss={onClose} type={PanelType.medium} headerText={`${request.number} · ${request.title}`} closeButtonAriaLabel="Zavřít" isFooterAtBottom onRenderFooterContent={() => footer}>
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RequestStatusBadge status={request.status} />
        <PriorityBadge priority={request.priority} />
        <span style={{ color: RES.gray, fontSize: 12 }}>{request.kind}</span>
      </div>
      <Fact label="Lokalita / soubor">
        {site ? `${site.number} ${site.name}` : request.siteNumber} · {device ? `${device.number} ${device.name}` : 'celá lokalita'}
      </Fact>
      <Fact label="Přijato">
        {formatDateTime(request.receivedAt)}, {request.receivedByName}
      </Fact>
      <Fact label="Nahlásil">{request.reportedBy}</Fact>
      <Fact label="Požadovaný termín">{request.requiredDate ? formatDate(request.requiredDate) : ''}</Fact>
      <Fact label="Popis">{request.description && <span style={{ whiteSpace: 'pre-wrap' }}>{request.description}</span>}</Fact>
      {request.note && <Fact label={request.status === RequestStatus.Zamitnuto ? 'Důvod zamítnutí' : 'Poznámka'}>{request.note}</Fact>}
      <Fact label="SLA (jen indikace)">
        <SlaIndicator progress={slaProgress(request, jobs, rules)} />
      </Fact>

      <div style={{ borderTop: `1px solid ${RES.grayBlue}`, marginTop: 8, paddingTop: 8 }}>
        <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>Přílohy požadavku</div>
        <ServiceAttachments target={{ kind: 'request', id: request.id }} pending={pending} onPendingChange={setPending} editable={mayWork && request.status !== RequestStatus.Zamitnuto} hideTitle />
      </div>

      <div style={{ borderTop: `1px solid ${RES.grayBlue}`, marginTop: 8, paddingTop: 8 }}>
        <div style={{ fontWeight: 600, color: RES.navy, marginBottom: 6 }}>Servisní listy ({own.length})</div>
        {own.length === 0 ? (
          <span style={{ color: RES.gray, fontSize: 13 }}>K požadavku zatím není servisní list.</span>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Číslo</th>
                <th style={TH}>Název</th>
                <th style={TH}>Druh</th>
                <th style={TH}>Stav</th>
                <th style={TH}>Termín</th>
              </tr>
            </thead>
            <tbody>
              {own.map((j) => (
                <tr key={j.id} style={{ borderTop: `1px solid ${RES.background}` }}>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    <Link onClick={() => onOpenJob(j.id)}>{j.number}</Link>
                  </td>
                  <td style={TD}>
                    {j.title}
                    <div style={{ color: RES.gray, fontSize: 12 }}>{j.isInternal ? 'Interní servis' : j.supplierName || 'dodavatel zatím nevybrán'}</div>
                  </td>
                  <td style={TD}>
                    <JobKindBadge kind={j.jobKind} />
                  </td>
                  <td style={TD}>
                    <JobStatusBadge status={j.status} />
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{j.plannedDate ? formatDate(j.plannedDate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {own.some((j) => jobDeletionProblem(j) !== '') && mayDelete && <div style={{ color: RES.gray, fontSize: 12, marginTop: 6 }}>Požadavek jde smazat, jen když jsou všechny jeho listy zrušené nebo nezpracované.</div>}
      </div>
    </Panel>
  );
};
