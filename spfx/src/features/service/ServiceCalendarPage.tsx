/**
 * Servisní kalendář (Servis → Kalendář) — přehled pro dispečera ve třech pohledech: **týden** (rozpis po dnech na 1 až 12 týdnů), **měsíc**
 * (měsíční mřížka) a **rok** (12 malých kalendářů, dny obarvené podle toho, co v ně připadá). Zobrazuje plánované servisy z ročního plánu
 * (s konkrétním datem) a otevřené servisní požadavky podle požadovaného termínu; plán jen s měsícem, požadavky po termínu a bez termínu jsou
 * zvlášť. Za všechny lokality, nebo jen za vybrané. Jen přehled — kliknutí na požadavek otevře jeho detail, na plán Servisní plány.
 */

import * as React from 'react';
import { ChoiceGroup } from '@fluentui/react/lib/ChoiceGroup';
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
import { buildCalendar, buildYear, CalendarData, CalendarEntry, CalendarWeek, monthSpan, shiftWeeks, YearDay } from '../../core/serviceOverview';

type View = 'tyden' | 'mesic' | 'rok';

const DAY_NAMES = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const PRIORITY_COLOR: Record<string, string> = { Havárie: '#C4314B', Vysoká: '#D9822B', Běžná: '#0268A6', Nízká: '#9AA3AD' };
const GREEN = '#2E9E5B';
const ORANGE = '#D9822B';
const BLUE = '#0268A6';

const openRequest = (number: string): void => navigate(RouteName.Service, `detail-${number}`);
const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Barva dne v ročním pohledu: požadavky modře, plán v paušálu zeleně, nahodilý oranžově, kombinace půl na půl. */
function dayColor(d: YearDay): { background: string; color: string } {
  const plan = d.planned + d.extra > 0;
  const planColor = d.planned > 0 ? GREEN : ORANGE;
  if (d.requests > 0 && plan) {
    return { background: `linear-gradient(135deg, ${planColor} 50%, ${BLUE} 50%)`, color: '#fff' };
  }
  if (d.requests > 0) {
    return { background: BLUE, color: '#fff' };
  }
  if (plan) {
    return { background: planColor, color: '#fff' };
  }
  return { background: '#F3F4F6', color: '#9AA3AD' };
}

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
  const [view, setView] = React.useState<View>('tyden');
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
  const today = new Date();
  const year = from.getFullYear();
  const month = from.getMonth();
  const opts = { sites: chosen, showPlan, showRequests };

  const span = monthSpan(year, month);
  const cal: CalendarData | undefined = view === 'tyden' ? buildCalendar(plan, requests, { ...opts, from, weeks }) : view === 'mesic' ? buildCalendar(plan, requests, { ...opts, from: span.from, weeks: span.weeks }) : undefined;
  const yearData = view === 'rok' ? buildYear(plan, requests, { ...opts, year }) : undefined;

  const step = (dir: number): void => {
    if (view === 'tyden') {
      setFrom(shiftWeeks(from, dir * weeks));
    } else if (view === 'mesic') {
      setFrom(new Date(year, month + dir, 1));
    } else {
      setFrom(new Date(year + dir, 0, 1));
    }
  };
  const periodLabel = view === 'tyden' ? '' : view === 'mesic' ? `${MONTH_NAMES[month]} ${year}` : String(year);

  const tip = (e: CalendarEntry): string =>
    `${e.kind === 'request' ? `Požadavek ${e.requestNumber} (${e.badge}, ${e.status})` : `Plánovaný servis (${e.badge === 'Plánovaná' ? 'v paušálu' : 'mimo paušál'})`}\n${e.title}\n${where(e.siteNumber, e.deviceNumber)}`;
  const go = (e: CalendarEntry): void => (e.kind === 'request' && e.requestNumber ? openRequest(e.requestNumber) : navigate(RouteName.ServicePlans));

  const chip = (e: CalendarEntry, compact: boolean): React.ReactNode => {
    const isRequest = e.kind === 'request';
    const color = isRequest ? PRIORITY_COLOR[e.badge] || BLUE : e.badge === 'Plánovaná' ? GREEN : ORANGE;
    return (
      <div
        key={e.key}
        role="button"
        tabIndex={0}
        onClick={() => go(e)}
        onKeyDown={(ev) => ev.key === 'Enter' && go(e)}
        title={tip(e)}
        style={{ cursor: 'pointer', background: isRequest ? '#E8F1FA' : e.badge === 'Plánovaná' ? '#E4F6EC' : '#FDE4CF', borderLeft: `4px solid ${color}`, borderRadius: 3, padding: compact ? '1px 5px' : '2px 6px', marginBottom: 3, fontSize: 11, lineHeight: 1.25 }}
      >
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isRequest ? '▶ ' : ''}
          {e.title}
        </div>
        {!compact && <div style={{ color: RES.gray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{where(e.siteNumber, e.deviceNumber)}</div>}
      </div>
    );
  };

  const requestLine = (r: ServiceRequest): React.ReactNode => (
    <div key={r.id} style={{ fontSize: 12, marginBottom: 2 }}>
      <a
        href="#"
        onClick={(ev) => {
          ev.preventDefault();
          openRequest(r.number);
        }}
      >
        {r.number}
      </a>{' '}
      {r.title}{' '}
      <span style={{ color: RES.gray }}>
        — {where(r.siteNumber, r.deviceNumber)}
        {r.requiredDate ? `, termín ${formatDate(r.requiredDate)}` : ''}
      </span>
    </div>
  );

  const strips = (overdue: ServiceRequest[], undated: ServiceRequest[], monthOnly: { year: number; month: number; items: PlanItem[] }[]): React.ReactNode => (
    <>
      {overdue.length > 0 && (
        <MessageBar messageBarType={MessageBarType.severeWarning} isMultiline styles={{ root: { marginBottom: 6 } }}>
          <strong>Po požadovaném termínu ({overdue.length}):</strong>
          {overdue.map(requestLine)}
        </MessageBar>
      )}
      {undated.length > 0 && (
        <MessageBar messageBarType={MessageBarType.info} isMultiline styles={{ root: { marginBottom: 6 } }}>
          <strong>Otevřené požadavky bez požadovaného termínu ({undated.length}):</strong>
          {undated.map(requestLine)}
        </MessageBar>
      )}
      {monthOnly.map((m) => (
        <MessageBar key={`${m.year}-${m.month}`} messageBarType={MessageBarType.success} isMultiline styles={{ root: { marginBottom: 6 } }}>
          <strong>
            Plánováno v měsíci {MONTH_NAMES[m.month - 1]} {m.year} (bez konkrétního dne, {m.items.length}):
          </strong>{' '}
          {m.items
            .slice(0, 12)
            .map((i) => `${i.title} (${where(i.siteNumber, i.deviceNumber)})`)
            .join('; ')}
          {m.items.length > 12 ? ` … a dalších ${m.items.length - 12}` : ''}
        </MessageBar>
      ))}
    </>
  );

  const weekBlock = (w: CalendarWeek, inMonth?: { year: number; month: number }): React.ReactNode => (
    <div key={w.start.getTime()} style={{ background: RES.white, border: `1px solid ${w.isCurrent ? RES.blue : RES.grayBlue}`, borderRadius: 4, marginBottom: inMonth ? 4 : 10, minWidth: 840 }}>
      {!inMonth && (
        <div style={{ background: w.isCurrent ? RES.bluePale : RES.background, padding: '4px 10px', fontWeight: 600 }}>
          Týden {w.number}{' '}
          <span style={{ fontWeight: 400, color: RES.gray }}>
            · {formatDate(w.start)} – {formatDate(w.end)}
          </span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))' }}>
        {w.days.map((d, i) => {
          const isToday = sameDay(d.date, today);
          const outside = !!inMonth && (d.date.getMonth() !== inMonth.month || d.date.getFullYear() !== inMonth.year);
          const limit = inMonth ? 3 : 99;
          return (
            <div key={i} style={{ borderLeft: i === 0 ? undefined : `1px solid ${RES.background}`, background: outside ? '#F3F4F6' : i >= 5 ? '#FAFAFA' : undefined, opacity: outside ? 0.55 : 1, minHeight: inMonth ? 84 : 72, padding: 4 }}>
              <div style={{ fontSize: 11, color: isToday ? RES.blue : RES.gray, fontWeight: isToday ? 700 : 400, marginBottom: 3 }}>
                {inMonth ? `${d.date.getDate()}.${outside ? ` ${d.date.getMonth() + 1}.` : ''}` : `${DAY_NAMES[i]} ${d.date.getDate()}. ${d.date.getMonth() + 1}.`}
              </div>
              {d.entries.slice(0, limit).map((e) => chip(e, !!inMonth))}
              {d.entries.length > limit && (
                <div style={{ fontSize: 11, color: RES.gray }} title={d.entries.map((e) => `${e.kind === 'request' ? '▶ ' : ''}${e.title} (${where(e.siteNumber, e.deviceNumber)})`).join('\n')}>
                  + {d.entries.length - limit} dalších
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const dayTip = (d: YearDay): string =>
    `${d.date.getDate()}. ${d.date.getMonth() + 1}. ${d.date.getFullYear()}${d.entries.length > 0 ? '\n' : ''}${d.entries.map((e) => `${e.kind === 'request' ? '▶' : '•'} ${e.title} (${where(e.siteNumber, e.deviceNumber)})`).join('\n')}`;

  return (
    <>
      <PageHeading title="Servisní kalendář" subtitle="Přehled plánovaných servisů a otevřených servisních požadavků po týdnech, měsících a za rok. Za všechny lokality, nebo jen za vybrané." />
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {!loaded && <Spinner size={SpinnerSize.large} label="Načítám…" />}
      {loaded && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
            <ChoiceGroup
              label="Pohled"
              selectedKey={view}
              options={[{ key: 'tyden', text: 'Týden' }, { key: 'mesic', text: 'Měsíc' }, { key: 'rok', text: 'Rok' }]}
              onChange={(_, o) => o && setView(o.key as View)}
              styles={{ flexContainer: { display: 'flex', gap: 12 } }}
            />
            <Dropdown
              label="Lokality"
              multiSelect
              placeholder="Všechny lokality"
              selectedKeys={chosen}
              options={sites.filter((s) => s.isActive).map((s) => ({ key: s.number, text: `${s.number} ${s.name}` }))}
              onChange={(_, o) => o && setChosen((cur) => (o.selected ? [...cur, String(o.key)] : cur.filter((k) => k !== String(o.key))))}
              styles={{ root: { width: 260 } }}
            />
            {view === 'tyden' && <Dropdown label="Počet týdnů" selectedKey={weeks} options={[1, 2, 4, 8, 12].map((n) => ({ key: n, text: String(n) }))} onChange={(_, o) => o && setWeeks(Number(o.key))} styles={{ root: { width: 110 } }} />}
            <Checkbox label="Plánované servisy" checked={showPlan} onChange={(_, v) => setShowPlan(!!v)} styles={{ root: { marginBottom: 6 } }} />
            <Checkbox label="Požadavky" checked={showRequests} onChange={(_, v) => setShowRequests(!!v)} styles={{ root: { marginBottom: 6 } }} />
            <span style={{ flex: '1 1 auto' }} />
            <DefaultButton iconProps={{ iconName: 'ChevronLeft' }} text="Dříve" onClick={() => step(-1)} />
            <DefaultButton text="Dnes" onClick={() => setFrom(new Date())} />
            <DefaultButton iconProps={{ iconName: 'ChevronRight' }} text="Později" onClick={() => step(1)} />
          </div>
          {periodLabel && <div style={{ fontSize: 18, fontWeight: 600, textTransform: 'capitalize', color: RES.navy, marginBottom: 6 }}>{periodLabel}</div>}
          <div style={{ fontSize: 12, color: RES.gray, marginBottom: 8 }}>
            {view === 'rok'
              ? 'Každý den je obarvený: zeleně plánovaný servis v paušálu, oranžově nahodilý, modře požadavek s termínem (půl na půl, když v ten den připadá obojí). Po najetí myší uvidíte, co v den připadá; kliknutím na měsíc ho otevřete.'
              : 'Plánované servisy: zeleně v paušálu, oranžově nahodilé. Požadavky (▶) modře, proužek podle priority. Kliknutím na požadavek otevřete jeho detail, na plánovaný servis Servisní plány.'}
          </div>

          {cal && strips(cal.overdue, cal.undated, view === 'mesic' ? cal.monthOnly.filter((m) => m.year === year && m.month === month + 1) : cal.monthOnly)}
          {cal && view === 'tyden' && <div style={{ overflowX: 'auto' }}>{cal.weeks.map((w) => weekBlock(w))}</div>}
          {cal && view === 'mesic' && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', minWidth: 840, fontSize: 12, color: RES.gray, fontWeight: 600, padding: '0 4px 2px' }}>
                {DAY_NAMES.map((n) => (
                  <div key={n}>{n}</div>
                ))}
              </div>
              {cal.weeks.map((w) => weekBlock(w, { year, month }))}
            </div>
          )}

          {yearData && (
            <>
              {strips(yearData.overdue, yearData.undated, [])}
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                Rok {year}: <strong>{yearData.totals.planned}</strong> plánovaných servisů v paušálu, <strong>{yearData.totals.extra}</strong> nahodilých, <strong>{yearData.totals.requests}</strong> požadavků s termínem
                {yearData.totals.monthOnly > 0 ? `, ${yearData.totals.monthOnly} plánovaných jen s měsícem (bez dne)` : ''}.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                {yearData.months.map((m) => {
                  const planCount = m.days.reduce((n, d) => n + d.planned + d.extra, 0);
                  const reqCount = m.days.reduce((n, d) => n + d.requests, 0);
                  const isNow = year === today.getFullYear() && m.month === today.getMonth();
                  return (
                    <div key={m.month} style={{ background: RES.white, border: `1px solid ${isNow ? RES.blue : RES.grayBlue}`, borderRadius: 4, padding: 8 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setFrom(new Date(year, m.month, 1));
                          setView('mesic');
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') {
                            setFrom(new Date(year, m.month, 1));
                            setView('mesic');
                          }
                        }}
                        title="Otevřít měsíc"
                        style={{ cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize', marginBottom: 4 }}
                      >
                        {MONTH_NAMES[m.month]}{' '}
                        <span style={{ fontWeight: 400, fontSize: 12, color: RES.gray }}>
                          · {planCount} plán · {reqCount} požadavků{m.monthOnly > 0 ? ` · +${m.monthOnly} bez dne` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                        {DAY_NAMES.map((n) => (
                          <div key={n} style={{ fontSize: 9, color: RES.gray, textAlign: 'center' }}>
                            {n.charAt(0)}
                          </div>
                        ))}
                        {Array.from({ length: m.offset }, (_, i) => (
                          <div key={`o${i}`} />
                        ))}
                        {m.days.map((d) => {
                          const c = dayColor(d);
                          const isToday = sameDay(d.date, today);
                          return (
                            <div
                              key={d.date.getDate()}
                              title={dayTip(d)}
                              style={{ ...c, textAlign: 'center', fontSize: 10, lineHeight: '20px', height: 20, borderRadius: 3, outline: isToday ? `2px solid ${RES.navy}` : undefined, outlineOffset: -1 }}
                            >
                              {d.date.getDate()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
};
