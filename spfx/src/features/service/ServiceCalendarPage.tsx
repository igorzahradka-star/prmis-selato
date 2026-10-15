/**
 * Servisní kalendář (Servis → Kalendář) — týdenní přehled pro dispečera: plánované servisy z ročního plánu (s konkrétním datem) a otevřené
 * servisní požadavky podle požadovaného termínu. Plán jen s měsícem, požadavky po termínu a bez termínu jsou nahoře zvlášť. Za všechny
 * lokality nebo jen za vybrané. Jen přehled — kliknutím na požadavek se otevře jeho detail v Servisu, na plán Servisní plány.
 */

import * as React from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';

import { useApp } from '../../ui/AppContext';
import { RES } from '../../ui/theme';
import { navigate, RouteName } from '../../ui/router';
import { PageHeading } from '../../ui/components/PageHeading';
import { formatDate } from '../../core/format';
import { canViewService, ServiceDevice, ServiceSite } from '../../core/service';
import { ServiceRequest } from '../../core/serviceJobs';
import { MONTH_NAMES, PlanItem } from '../../core/servicePlan';
import { buildCalendar, CalendarEntry, shiftWeeks } from '../../core/serviceOverview';

const DAY_NAMES = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const PRIORITY_COLOR: Record<string, string> = { Havárie: '#C4314B', Vysoká: '#D9822B', Běžná: '#0268A6', Nízká: '#9AA3AD' };

const openRequest = (number: string): void => navigate(RouteName.Service, `detail-${number}`);

export const ServiceCalendarPage: React.FC = () => {
  const { repos, user } = useApp();
  const mayView = canViewService(user.roles);
  const [sites, setSites] = React.useState<ServiceSite[]>([]);
  const [devices, setDevices] = React.useState<ServiceDevice[]>([]);
  const [plan, setPlan] = React.useState<PlanItem[]>([]);
  const [requests, setRequests] = React.useState<ServiceRequest[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [showPlan, setShowPlan] = React.useState(true);
  const [showRequests, setShowRequests] = React.useState(true);
  const [weeks, setWeeks] = React.useState(4);
  const [from, setFrom] = React.useState(() => new Date());

  React.useEffect(() => {
    if (!mayView) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    Promise.all([repos.service.listSites(), repos.service.listDevices(), repos.service.listPlan(), repos.service.listRequests()])
      .then(([s, d, p, r]) => {
        if (!cancelled) {
          setSites(s);
          setDevices(d);
          setPlan(p);
          setRequests(r);
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
  }, [repos, mayView]);

  if (!mayView) {
    return (
      <>
        <PageHeading title="Servisní kalendář" />
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          Servis je přístupný jen správci servisu, dispečerovi, vedení, čtenáři a administrátorovi.
        </MessageBar>
      </>
    );
  }

  const where = (siteNumber: string, deviceNumber?: string): string => {
    const s = sites.filter((x) => x.number === siteNumber)[0];
    const d = deviceNumber ? devices.filter((x) => x.number === deviceNumber)[0] : undefined;
    return `${s ? `${s.number} ${s.name}` : siteNumber}${d ? ` · ${d.name}` : ''}`;
  };
  const data = buildCalendar(plan, requests, { from, weeks, sites: chosen, showPlan, showRequests });
  const today = new Date();
  const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const chip = (e: CalendarEntry): React.ReactNode => {
    const isRequest = e.kind === 'request';
    const color = isRequest ? PRIORITY_COLOR[e.badge] || '#0268A6' : e.badge === 'Plánovaná' ? '#2E9E5B' : '#D9822B';
    return (
      <div
        key={e.key}
        role="button"
        tabIndex={0}
        onClick={() => (isRequest && e.requestNumber ? openRequest(e.requestNumber) : navigate(RouteName.ServicePlans))}
        onKeyDown={(ev) => ev.key === 'Enter' && (isRequest && e.requestNumber ? openRequest(e.requestNumber) : navigate(RouteName.ServicePlans))}
        title={`${isRequest ? `Požadavek ${e.requestNumber} (${e.badge}, ${e.status})` : `Plánovaný servis (${e.badge === 'Plánovaná' ? 'v paušálu' : 'mimo paušál'})`}\n${e.title}\n${where(e.siteNumber, e.deviceNumber)}`}
        style={{ cursor: 'pointer', background: isRequest ? '#E8F1FA' : e.badge === 'Plánovaná' ? '#E4F6EC' : '#FDE4CF', borderLeft: `4px solid ${color}`, borderRadius: 3, padding: '2px 6px', marginBottom: 3, fontSize: 11, lineHeight: 1.25 }}
      >
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isRequest ? '▶ ' : ''}
          {e.title}
        </div>
        <div style={{ color: RES.gray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{where(e.siteNumber, e.deviceNumber)}</div>
      </div>
    );
  };

  const requestLine = (r: ServiceRequest): React.ReactNode => (
    <div key={r.id} style={{ fontSize: 12, marginBottom: 2 }}>
      <a href="#" onClick={(ev) => { ev.preventDefault(); openRequest(r.number); }}>{r.number}</a> {r.title} <span style={{ color: RES.gray }}>— {where(r.siteNumber, r.deviceNumber)}{r.requiredDate ? `, termín ${formatDate(r.requiredDate)}` : ''}</span>
    </div>
  );

  return (
    <>
      <PageHeading title="Servisní kalendář" subtitle="Týdenní přehled plánovaných servisů a otevřených servisních požadavků. Za všechny lokality, nebo jen za vybrané." />
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!loaded && <Spinner size={SpinnerSize.large} label="Načítám…" />}
      {loaded && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
            <Dropdown
              label="Lokality"
              multiSelect
              placeholder="Všechny lokality"
              selectedKeys={chosen}
              options={sites.filter((s) => s.isActive).map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))}
              onChange={(_, o) => o && setChosen((cur) => (o.selected ? [...cur, String(o.key)] : cur.filter((k) => k !== String(o.key))))}
              styles={{ root: { width: 280 } }}
            />
            <Dropdown label="Počet týdnů" selectedKey={weeks} options={[1, 2, 4, 8, 12].map((n) => ({ key: n, text: String(n) }))} onChange={(_, o) => o && setWeeks(Number(o.key))} styles={{ root: { width: 110 } }} />
            <Checkbox label="Plánované servisy" checked={showPlan} onChange={(_, v) => setShowPlan(!!v)} styles={{ root: { marginBottom: 6 } }} />
            <Checkbox label="Požadavky" checked={showRequests} onChange={(_, v) => setShowRequests(!!v)} styles={{ root: { marginBottom: 6 } }} />
            <span style={{ flex: '1 1 auto' }} />
            <DefaultButton iconProps={{ iconName: 'ChevronLeft' }} text="Dříve" onClick={() => setFrom(shiftWeeks(from, -weeks))} />
            <DefaultButton text="Dnes" onClick={() => setFrom(new Date())} />
            <DefaultButton iconProps={{ iconName: 'ChevronRight' }} text="Později" onClick={() => setFrom(shiftWeeks(from, weeks))} />
          </div>
          <div style={{ fontSize: 12, color: RES.gray, marginBottom: 8 }}>
            Plánované servisy: zeleně v paušálu, oranžově nahodilé. Požadavky (▶) modře, proužek podle priority. Kliknutím na požadavek otevřete jeho detail, na plánovaný servis Servisní plány.
          </div>

          {data.overdue.length > 0 && (
            <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline styles={{ root: { marginBottom: 6 } }}>
              <strong>Po požadovaném termínu ({data.overdue.length}):</strong>
              {data.overdue.map(requestLine)}
            </MessageBar>
          )}
          {data.undated.length > 0 && (
            <MessageBar messageBarType={MessageBarType.info} isMultiline styles={{ root: { marginBottom: 6 } }}>
              <strong>Otevřené požadavky bez požadovaného termínu ({data.undated.length}):</strong>
              {data.undated.map(requestLine)}
            </MessageBar>
          )}
          {data.monthOnly.map((m) => (
            <MessageBar key={`${m.year}-${m.month}`} messageBarType={MessageBarType.success} isMultiline styles={{ root: { marginBottom: 6 } }}>
              <strong>
                Plánováno v měsíci {MONTH_NAMES[m.month - 1]} {m.year} (bez konkrétního dne, {m.items.length}):
              </strong>{' '}
              {m.items.slice(0, 12).map((i) => `${i.title} (${where(i.siteNumber, i.deviceNumber)})`).join('; ')}
              {m.items.length > 12 ? ` … a dalších ${m.items.length - 12}` : ''}
            </MessageBar>
          ))}

          <div style={{ overflowX: 'auto' }}>
            {data.weeks.map((w) => (
              <div key={w.start.getTime()} style={{ background: RES.white, border: `1px solid ${w.isCurrent ? RES.blue : RES.grayBlue}`, borderRadius: 4, marginBottom: 10, minWidth: 840 }}>
                <div style={{ background: w.isCurrent ? RES.bluePale : RES.background, padding: '4px 10px', fontWeight: 600 }}>
                  Týden {w.number} <span style={{ fontWeight: 400, color: RES.gray }}>· {formatDate(w.start)} – {formatDate(w.end)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))' }}>
                  {w.days.map((d, i) => {
                    const isToday = sameDay(d.date, today);
                    return (
                      <div key={i} style={{ borderLeft: i === 0 ? undefined : `1px solid ${RES.background}`, background: i >= 5 ? '#FAFAFA' : undefined, minHeight: 72, padding: 4 }}>
                        <div style={{ fontSize: 11, color: isToday ? RES.blue : RES.gray, fontWeight: isToday ? 700 : 400, marginBottom: 3 }}>
                          {DAY_NAMES[i]} {d.date.getDate()}. {d.date.getMonth() + 1}.
                        </div>
                        {d.entries.map(chip)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};
