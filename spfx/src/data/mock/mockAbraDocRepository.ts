/**
 * Doklady z Abry v ukázkovém režimu — pro každý projekt pár vymyšlených dokladů (přijaté, vydané, dobropis, zálohy),
 * aby šlo zkoušet přiřazování. Žádost o aktualizaci jen označí „čeká“ a po chvíli se tváří jako hotová.
 */

import { CurrentUser } from '../../core/types';
import { AbraDoc } from '../../core/abraDocs';
import { AbraSyncStatus, IAbraDocRepository } from '../repositories';

const day = (y: number, m: number, d: number): Date => new Date(y, m - 1, d);

function sampleDocs(projectNumber: string): AbraDoc[] {
  const n = projectNumber;
  const base = { projectNumber: n, currency: 'CZK' as const, syncedAt: new Date() };
  return [
    { ...base, id: 1, abraId: `FP-${n}-1`, type: 'prijata', number: `FP${n}0001`, partnerName: 'Memodo s.r.o.', description: 'Střídač 100 kW, dodávka', issueDate: day(2026, 8, 12), dueDate: day(2026, 9, 11), amountNet: 480000, accounts: ['501'] },
    { ...base, id: 2, abraId: `FP-${n}-2`, type: 'prijata', number: `FP${n}0002`, partnerName: 'Memodo s.r.o.', description: 'Střídač 50 kW', issueDate: day(2026, 8, 20), dueDate: day(2026, 9, 19), amountNet: 250000, accounts: ['501'] },
    { ...base, id: 3, abraId: `FP-${n}-3`, type: 'prijata', number: `FP${n}0003`, partnerName: 'DV ELEKTRO s.r.o.', description: 'Montáž kabeláže', issueDate: day(2026, 9, 2), dueDate: day(2026, 10, 2), amountNet: 96500, accounts: ['518'] },
    { ...base, id: 8, abraId: `FP-${n}-4`, type: 'prijata', number: `FP${n}0004`, partnerName: 'Sungrow Europe GmbH', description: 'Střídače Sungrow (EUR)', issueDate: day(2026, 9, 15), dueDate: day(2026, 10, 15), currency: 'EUR', amountNet: 12000, amountNetCzk: 296400, accounts: ['501'] },
    { ...base, id: 4, abraId: `DP-${n}-1`, type: 'prijata', number: `DP${n}0001`, partnerName: 'Memodo s.r.o.', description: 'Dobropis — poškozený kus', issueDate: day(2026, 9, 10), amountNet: -18000, accounts: ['501'] },
    { ...base, id: 5, abraId: `FV-${n}-1`, type: 'vydana', number: `FV${n}0001`, partnerName: 'Sunset Terrace s.r.o.', description: '1. dílčí fakturace', issueDate: day(2026, 8, 31), dueDate: day(2026, 9, 30), amountNet: 150000, accounts: ['601'] },
    { ...base, id: 6, abraId: `ZP-${n}-1`, type: 'zaloha-prijata', number: `ZP${n}0001`, partnerName: 'SELATO s.r.o.', description: 'Záloha na konstrukce', issueDate: day(2026, 9, 5), dueDate: day(2026, 9, 12), amountNet: 120000 },
    { ...base, id: 7, abraId: `ZV-${n}-1`, type: 'zaloha-vydana', number: `ZV${n}0001`, partnerName: 'Sunset Terrace s.r.o.', description: 'Zálohová faktura 30 %', issueDate: day(2026, 7, 15), dueDate: day(2026, 7, 29), amountNet: 300000 }
  ];
}

export class MockAbraDocRepository implements IAbraDocRepository {
  private pendingSince: Date | undefined;
  private lastSyncAt: Date | undefined = new Date(Date.now() - 6 * 3600 * 1000);

  public list(projectNumber: string): Promise<AbraDoc[]> {
    return Promise.resolve(sampleDocs(projectNumber));
  }

  public syncStatus(): Promise<AbraSyncStatus> {
    return Promise.resolve({ configured: true, lastSyncAt: this.lastSyncAt, lastOk: true, lastMessage: 'Ukázková data (bez napojení na Abru).', pendingSince: this.pendingSince });
  }

  public requestSync(_actor: CurrentUser): Promise<void> {
    if (!this.pendingSince) {
      this.pendingSince = new Date();
      setTimeout(() => {
        this.pendingSince = undefined;
        this.lastSyncAt = new Date();
      }, 3000);
    }
    return Promise.resolve();
  }
}
