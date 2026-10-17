import { AbraDoc } from './abraDocs';
import {
  AbraCorrection,
  autoResolvable,
  correctionLine,
  correctionMail,
  correctionNoteProblem,
  isGoneFromAbra,
  isOpenCorrection,
  openCorrectionsByDoc,
  summarizeCorrections
} from './abraCorrections';

const doc = (abraId: string, extra: Partial<AbraDoc> = {}): AbraDoc => ({ id: 1, abraId, type: 'prijata', number: `FP-${abraId}`, projectNumber: '26001', currency: 'CZK', amountNet: 10000, partnerName: 'Memodo s.r.o.', description: 'Střídač', accounts: ['501'], issueDate: new Date(2026, 7, 12), ...extra });

const corr = (id: number, abraId: string, status: AbraCorrection['status'], extra: Partial<AbraCorrection> = {}): AbraCorrection => ({
  id,
  projectNumber: '26001',
  abraId,
  docNumber: `FP-${abraId}`,
  note: 'Patří k projektu 26004',
  status,
  line: correctionLine(doc(abraId)),
  markedByName: 'Petr PM',
  markedAt: new Date(2026, 9, 1),
  ...extra
});

describe('opravy řádků z účetnictví', () => {
  it('popis opravy nesmí být prázdný ani jednoslovný', () => {
    expect(correctionNoteProblem('')).not.toBe('');
    expect(correctionNoteProblem('  ab ')).not.toBe('');
    expect(correctionNoteProblem('Patří k projektu 26004')).toBe('');
  });

  it('otevřená oprava = označeno nebo odesláno; u řádku je otevřená nejvýš jedna', () => {
    expect(isOpenCorrection({ status: 'Označeno' })).toBe(true);
    expect(isOpenCorrection({ status: 'Odesláno' })).toBe(true);
    expect(isOpenCorrection({ status: 'Vyřešeno' })).toBe(false);
    expect(isOpenCorrection({ status: 'Zrušeno' })).toBe(false);
    const m = openCorrectionsByDoc([corr(1, 'A', 'Zrušeno'), corr(2, 'A', 'Označeno'), corr(3, 'B', 'Vyřešeno')]);
    expect(Array.from(m.keys())).toEqual(['A']);
    expect(m.get('A')?.id).toBe(2);
  });

  it('řádek, který zmizel z Abry nebo je označený „zmizel z Abry“', () => {
    const rows = [doc('A'), doc('B', { description: 'Střídač — zmizel z Abry' })];
    expect(isGoneFromAbra(rows, 'A')).toBe(false);
    expect(isGoneFromAbra(rows, 'B')).toBe(true);
    expect(isGoneFromAbra(rows, 'C')).toBe(true);
  });

  it('samy se uzavírají otevřené opravy, jejichž řádek zmizel, a jen když se z Abry něco stáhlo', () => {
    const list = [corr(1, 'A', 'Odesláno'), corr(2, 'B', 'Odesláno'), corr(3, 'C', 'Označeno'), corr(4, 'D', 'Vyřešeno')];
    expect(autoResolvable(list, [doc('A')]).map((c) => c.id)).toEqual([2, 3]);
    // prázdný seznam z Abry (výpadek) nic neuzavře
    expect(autoResolvable(list, [])).toEqual([]);
  });

  it('souhrn: k odeslání, čeká na účtárnu a nejdéle čekající', () => {
    const today = new Date(2026, 9, 17);
    const s = summarizeCorrections([corr(1, 'A', 'Označeno'), corr(2, 'B', 'Odesláno', { sentAt: new Date(2026, 9, 7) }), corr(3, 'C', 'Odesláno', { sentAt: new Date(2026, 9, 15) }), corr(4, 'D', 'Vyřešeno')], today);
    expect(s).toEqual({ toSend: 1, waiting: 2, oldestWaitingDays: 10 });
    expect(summarizeCorrections([], today)).toEqual({ toSend: 0, waiting: 0, oldestWaitingDays: undefined });
  });

  it('e-mail účtárně obsahuje projekt, doklady, částky, účty a popis opravy', () => {
    const mail = correctionMail({ projectNumber: '26001', projectTitle: 'MASTIROVICE 1', requesterName: 'Petr PM', corrections: [corr(1, 'A', 'Označeno'), corr(2, 'B', 'Označeno', { note: 'Patří k 26004' })], link: 'https://x/#/projekt/26001' });
    expect(mail.subject).toBe('Žádost o opravu zaúčtování — projekt 26001 (2 řádky)');
    expect(mail.bodyText).toContain('Petr PM');
    expect(mail.bodyText).toContain('26001 MASTIROVICE 1');
    expect(mail.bodyText).toContain('Doklad FP-A (Faktura přijatá)');
    expect(mail.bodyText).toContain('Memodo s.r.o.');
    expect(mail.bodyText).toContain('501');
    expect(mail.bodyText).toContain('Požadovaná oprava: Patří k 26004');
    expect(mail.bodyText).toContain('https://x/#/projekt/26001');
    expect(correctionMail({ projectNumber: '1', projectTitle: 't', requesterName: 'a', corrections: [corr(1, 'A', 'Označeno')], link: 'l' }).subject).toContain('(1 řádek)');
  });
});
