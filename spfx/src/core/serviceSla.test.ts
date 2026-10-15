import { JobStatus, RequestStatus, ServiceJob, ServiceRequest } from './serviceJobs';
import { DEFAULT_SERVICE_SETTINGS, SlaRule, formatHours, isSlaBreached, matchSlaRule, requestReactedAt, requestResolvedAt, serviceSettingsWithDefaults, slaProgress, validateSlaRules } from './serviceSla';

const t = (day: number, hour: number): Date => new Date(2026, 9, day, hour, 0, 0);
const request = (over: Partial<ServiceRequest> = {}): ServiceRequest =>
  ({ id: 1, number: 'SPO-2026-0001', siteNumber: '10500', title: 'x', priority: 'Vysoká', kind: 'Porucha', receivedAt: t(1, 8), receivedByName: 'a', status: RequestStatus.Zpracovava, ...over } as ServiceRequest);
const job = (over: Partial<ServiceJob> = {}): ServiceJob =>
  ({ id: 1, number: 'SL-2026-0001', requestId: 1, siteNumber: '10500', deviceNumber: '10501', title: 'x', status: JobStatus.Naplanovano, ...over } as ServiceJob);

describe('SLA — pravidla', () => {
  it('použije nejpřesnější shodné pravidlo', () => {
    const rules: SlaRule[] = [{ priority: 'Vysoká', reactionHours: 8 }, { kind: 'Porucha', priority: 'Vysoká', reactionHours: 2 }, { kind: 'Porucha', reactionHours: 12 }, { reactionHours: 99 }];
    expect(matchSlaRule(rules, { kind: 'Porucha', priority: 'Vysoká' })?.reactionHours).toBe(2);
    expect(matchSlaRule(rules, { kind: 'Ostatní', priority: 'Vysoká' })?.reactionHours).toBe(8);
    expect(matchSlaRule(rules, { kind: 'Porucha', priority: 'Běžná' })?.reactionHours).toBe(12);
    expect(matchSlaRule(rules, { kind: 'Ostatní', priority: 'Běžná' })?.reactionHours).toBe(99);
    expect(matchSlaRule([], { kind: 'Porucha', priority: 'Běžná' })).toBeUndefined();
  });

  it('výchozí nastavení: havárie 4 h / 24 h; preventivní prohlídka se nesleduje', () => {
    const s = serviceSettingsWithDefaults(undefined);
    expect(matchSlaRule(s.slaRules, { kind: 'Porucha', priority: 'Havárie' })).toMatchObject({ reactionHours: 4, resolveHours: 24 });
    const prev = matchSlaRule(s.slaRules, { kind: 'Preventivní prohlídka', priority: 'Běžná' });
    expect(prev?.reactionHours).toBeUndefined();
    expect(DEFAULT_SERVICE_SETTINGS.slaRules.length).toBeGreaterThan(0);
    expect(serviceSettingsWithDefaults({ slaRules: [] }).slaRules).toEqual([]);
  });

  it('kontrola pravidel: lhůta musí být kladná a vyřešení ne kratší než reakce', () => {
    expect(validateSlaRules([{ priority: 'Havárie', reactionHours: 4, resolveHours: 24 }])).toEqual([]);
    expect(validateSlaRules([{ reactionHours: 0 }]).length).toBe(1);
    expect(validateSlaRules([{ reactionHours: 10, resolveHours: 5 }]).length).toBe(1);
  });
});

describe('SLA — měření', () => {
  const rules: SlaRule[] = [{ priority: 'Vysoká', reactionHours: 8, resolveHours: 48 }];

  it('reakce = první založený list, vyřešení = poslední provedení po provedení všech listů', () => {
    expect(requestReactedAt([job({ createdAt: t(1, 12) }), job({ id: 2, createdAt: t(1, 10) })])).toEqual(t(1, 10));
    expect(requestReactedAt([])).toBeUndefined();
    expect(requestResolvedAt([job({ status: JobStatus.Provedeno, doneAt: t(2, 9) }), job({ id: 2, status: JobStatus.Uzavreno, doneAt: t(3, 9) })])).toEqual(t(3, 9));
    expect(requestResolvedAt([job({ status: JobStatus.Provedeno, doneAt: t(2, 9) }), job({ id: 2, status: JobStatus.Objednano })])).toBeUndefined();
    expect(requestResolvedAt([job({ status: JobStatus.Zruseno })])).toBeUndefined();
  });

  it('běží, varuje po 80 % a po lhůtě je překročeno', () => {
    expect(slaProgress(request(), [], rules, t(1, 12)).reaction.state).toBe('running');
    expect(slaProgress(request(), [], rules, t(1, 15)).reaction.state).toBe('warning');
    const late = slaProgress(request(), [], rules, t(1, 17));
    expect(late.reaction.state).toBe('breached');
    expect(isSlaBreached(late)).toBe(true);
  });

  it('splněno včas i po lhůtě', () => {
    const ok = slaProgress(request(), [job({ createdAt: t(1, 10), status: JobStatus.Provedeno, doneAt: t(2, 8) })], rules, t(5, 8));
    expect(ok.reaction.state).toBe('met');
    expect(ok.resolve.state).toBe('met');
    const lateJob = slaProgress(request(), [job({ createdAt: t(2, 8), status: JobStatus.Provedeno, doneAt: t(5, 8) })], rules, t(6, 8));
    expect(lateJob.reaction.state).toBe('metLate');
    expect(lateJob.resolve.state).toBe('metLate');
    expect(isSlaBreached(lateJob)).toBe(false);
  });

  it('bez pravidla a u zamítnutého požadavku se nesleduje', () => {
    expect(slaProgress(request({ priority: 'Nízká' }), [], rules, t(9, 8)).reaction.state).toBe('none');
    expect(slaProgress(request({ status: RequestStatus.Zamitnuto }), [], rules, t(9, 8)).resolve.state).toBe('none');
  });

  it('hodiny jako text', () => {
    expect(formatHours(3.4)).toBe('3 h');
    expect(formatHours(50)).toBe('2 d 2 h');
    expect(formatHours(72)).toBe('3 d');
  });
});

describe('SLA — požadavek uzavřený přímo bez servisního listu', () => {
  const rules: SlaRule[] = [{ priority: 'Vysoká', reactionHours: 4, resolveHours: 8 }];

  it('reakce i vyřešení nastaly okamžikem uzavření', () => {
    const closed = request({ status: RequestStatus.Vyreseno, resolvedAt: t(1, 10) });
    const p = slaProgress(closed, [], rules, t(5, 8));
    expect(p.reaction.state).toBe('met');
    expect(p.resolve.state).toBe('met');
    expect(p.resolve.elapsedHours).toBe(2);
  });

  it('uzavření po lhůtě je splněno pozdě', () => {
    const late = slaProgress(request({ status: RequestStatus.Vyreseno, resolvedAt: t(1, 20) }), [], rules, t(5, 8));
    expect(late.reaction.state).toBe('metLate');
    expect(late.resolve.state).toBe('metLate');
  });

  it('bez času uzavření (starší data) se chová jako dřív', () => {
    expect(slaProgress(request({ status: RequestStatus.Vyreseno }), [], rules, t(1, 9)).reaction.state).toBe('running');
  });
});
