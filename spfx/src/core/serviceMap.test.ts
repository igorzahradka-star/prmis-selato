import { ServiceDevice, ServiceSite } from './service';
import { JobStatus, RequestStatus, ServiceJob, ServiceRequest } from './serviceJobs';
import { deviceCoordinates, deviceOffsetsPx, missingLocations, serviceSignal, siteCoordinates } from './serviceMap';

const site = (over: Partial<ServiceSite> = {}): ServiceSite => ({ id: 1, number: '10500', name: 'Mastířovice', isActive: true, latitude: 49.1, longitude: 16.2, ...over });
const device = (over: Partial<ServiceDevice> = {}): ServiceDevice => ({ id: 1, number: '10501', siteNumber: '10500', name: 'FVE I', kind: 'FVE', isActive: true, ...over });
const request = (over: Partial<ServiceRequest> = {}): ServiceRequest =>
  ({ id: 1, number: 'SPO-2026-0001', siteNumber: '10500', title: 'x', priority: 'Běžná', kind: 'Porucha', receivedAt: new Date(2026, 9, 1), receivedByName: 'a', status: RequestStatus.Prijato, ...over } as ServiceRequest);
const job = (over: Partial<ServiceJob> = {}): ServiceJob =>
  ({ id: 1, number: 'SL-2026-0001', siteNumber: '10500', deviceNumber: '10501', title: 'x', status: JobStatus.Naplanovano, ...over } as ServiceJob);
const today = new Date(2026, 9, 15);

describe('mapa Servisu — polohy', () => {
  it('soubor bez vlastní polohy použije polohu lokality', () => {
    expect(deviceCoordinates(device(), site())).toEqual({ latitude: 49.1, longitude: 16.2 });
    expect(deviceCoordinates(device({ latitude: 49.2, longitude: 16.3 }), site())).toEqual({ latitude: 49.2, longitude: 16.3 });
    expect(siteCoordinates(site({ latitude: undefined }))).toBeUndefined();
    expect(deviceCoordinates(device(), site({ latitude: 0, longitude: 0 }))).toBeUndefined();
  });

  it('chybějící polohy se ohlásí jen u aktivních položek', () => {
    const r = missingLocations([site({ latitude: undefined, longitude: undefined }), site({ id: 2, number: '10510', isActive: false, latitude: undefined })], [device()]);
    expect(r.sites.map((s) => s.number)).toEqual(['10500']);
    expect(r.devices.map((d) => d.number)).toEqual(['10501']);
    expect(missingLocations([site()], [device()]).devices).toEqual([]);
  });

  it('soubory na jednom místě se rozestaví do vystředěné řady', () => {
    expect(deviceOffsetsPx(1)).toEqual([0]);
    expect(deviceOffsetsPx(2, 30)).toEqual([-15, 15]);
    expect(deviceOffsetsPx(3, 30)).toEqual([-30, 0, 30]);
  });
});

describe('mapa Servisu — barva špendlíku', () => {
  it('zelená, když je vše v pořádku', () => {
    expect(serviceSignal('10500', [device()], [], [], undefined, today)).toBe('green');
  });
  it('oranžová při otevřeném požadavku nebo končící smlouvě', () => {
    expect(serviceSignal('10500', [device()], [request()], [], undefined, today)).toBe('amber');
    expect(serviceSignal('10500', [device({ contractFrom: new Date(2026, 0, 1), contractTo: new Date(2026, 10, 20), contractUrl: 'x' })], [], [], undefined, today)).toBe('amber');
    expect(serviceSignal('10500', [device()], [request({ status: RequestStatus.Vyreseno })], [], undefined, today)).toBe('green');
  });
  it('červená, když je list po termínu; zrušený se nepočítá', () => {
    const late = job({ plannedDate: new Date(2026, 9, 1) });
    expect(serviceSignal('10500', [device()], [], [late], undefined, today)).toBe('red');
    expect(serviceSignal('10500', [device()], [], [{ ...late, status: JobStatus.Zruseno }], undefined, today)).toBe('green');
  });
  it('u souboru se hodnotí jen jeho listy a požadavky', () => {
    const late = job({ deviceNumber: '10502', plannedDate: new Date(2026, 9, 1) });
    const two = [device(), device({ id: 2, number: '10502' })];
    expect(serviceSignal('10500', two, [], [late], '10501', today)).toBe('green');
    expect(serviceSignal('10500', two, [], [late], '10502', today)).toBe('red');
  });
});
