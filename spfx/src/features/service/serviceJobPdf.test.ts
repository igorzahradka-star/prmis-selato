import { DEFAULT_SETTINGS } from '../../core/settings';
import { buildServiceJobDocument, serviceJobPdfFileName, ServiceJobPdfData } from './serviceJobPdf';

const data = (over: Partial<ServiceJobPdfData> = {}): ServiceJobPdfData => ({
  number: 'SL-2026-0005',
  title: 'Výměna střídače',
  siteName: '10500 Mastířovice',
  deviceName: '10501 Mastířovice I. FVE',
  kind: 'Nahodilá',
  isInternal: false,
  supplier: { name: 'FVE Servis Morava s.r.o.', ico: '12345678' },
  plannedDate: new Date(2026, 9, 20),
  description: 'Diagnostika a výměna střídače č. 3',
  attachmentNames: ['foto_1.jpg', 'Nakres_1.png'],
  company: DEFAULT_SETTINGS.company,
  issuer: { name: 'David Dispečer', at: new Date(2026, 9, 15, 9, 30) },
  ...over
});

const text = (d: ServiceJobPdfData): string => JSON.stringify(buildServiceJobDocument(d).content);

describe('PDF servisního listu', () => {
  it('obsahuje číslo, zadání, dodavatele, přílohy a podpis vystavitele', () => {
    const t = text(data());
    expect(t).toContain('SL-2026-0005');
    expect(t).toContain('Diagnostika a výměna střídače');
    expect(t).toContain('FVE Servis Morava s.r.o.');
    expect(t).toContain('foto_1.jpg');
    expect(t).toContain('David Dispečer');
    expect(t).toContain('Elektronicky podepsáno');
  });

  it('interní servis nemá dodavatele; bez příloh to řekne; podklady z požadavku se uvedou', () => {
    const t = text(data({ isInternal: true, supplier: undefined, attachmentNames: [], requestNumber: 'SPO-2026-0002', requestTitle: 'Porucha střídače' }));
    expect(t).toContain('Interní servis');
    expect(t).not.toContain('FVE Servis Morava');
    expect(t).toContain('Bez příloh.');
    expect(t).toContain('SPO-2026-0002');
  });

  it('vodoznak a název souboru', () => {
    expect(buildServiceJobDocument(data({ watermark: 'ZRUŠENO' })).watermark).toMatchObject({ text: 'ZRUŠENO' });
    expect(serviceJobPdfFileName('SL-2026-0005')).toBe('SL-2026-0005.pdf');
  });
});
