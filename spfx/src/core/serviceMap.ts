/**
 * Mapa Servisu — čistá logika: poloha lokalit a souborů, barva špendlíku podle stavu a rozestavení souborů kolem lokality.
 *
 * Lokalita je bod na mapě; soubory (FVE, BESS…) se ukážou až po dostatečném přiblížení. Soubor bez vlastní polohy
 * leží na poloze lokality a rozestaví se do řady, aby se nepřekrývaly.
 */

import { isValidCoordinates, Coordinates } from './geo';
import { ServiceDevice, ServiceSite, contractState } from './service';
import { JobStatus, RequestStatus, ServiceJob, ServiceRequest, isJobOverdue } from './serviceJobs';

/** Od tohoto přiblížení se místo lokality ukazují její soubory. */
export const SERVICE_DEVICE_ZOOM = 14;

export type ServiceSignal = 'red' | 'amber' | 'green';

export const SERVICE_SIGNAL_LABELS: Record<ServiceSignal, string> = {
  red: 'Servisní list po termínu',
  amber: 'Otevřený požadavek nebo končící smlouva',
  green: 'V pořádku'
};

export function siteCoordinates(site: Pick<ServiceSite, 'latitude' | 'longitude'>): Coordinates | undefined {
  return isValidCoordinates(site.latitude, site.longitude) ? { latitude: site.latitude as number, longitude: site.longitude as number } : undefined;
}

/** Poloha souboru: vlastní, jinak poloha lokality. */
export function deviceCoordinates(device: Pick<ServiceDevice, 'latitude' | 'longitude'>, site: Pick<ServiceSite, 'latitude' | 'longitude'>): Coordinates | undefined {
  return isValidCoordinates(device.latitude, device.longitude) ? { latitude: device.latitude as number, longitude: device.longitude as number } : siteCoordinates(site);
}

const isOpenRequest = (r: ServiceRequest): boolean => r.status === RequestStatus.Prijato || r.status === RequestStatus.Zpracovava;

/**
 * Barva špendlíku: červená = servisní list po termínu; oranžová = otevřený požadavek nebo smlouva, která končí / vypršela; jinak zelená.
 * `deviceNumber` omezí hodnocení na jeden soubor.
 */
export function serviceSignal(
  siteNumber: string,
  devices: ServiceDevice[],
  requests: ServiceRequest[],
  jobs: ServiceJob[],
  deviceNumber?: string,
  today: Date = new Date()
): ServiceSignal {
  const ofSite = devices.filter((d) => d.siteNumber === siteNumber && d.isActive && (!deviceNumber || d.number === deviceNumber));
  const matchesJob = (j: ServiceJob): boolean => j.siteNumber === siteNumber && (!deviceNumber || j.deviceNumber === deviceNumber);
  if (jobs.some((j) => matchesJob(j) && j.status !== JobStatus.Zruseno && isJobOverdue(j, today))) {
    return 'red';
  }
  const openRequest = requests.some((r) => r.siteNumber === siteNumber && isOpenRequest(r) && (!deviceNumber || r.deviceNumber === deviceNumber));
  const contract = ofSite.some((d) => {
    const s = contractState(d, today);
    return s === 'konci' || s === 'vyprsela';
  });
  return openRequest || contract ? 'amber' : 'green';
}

/** Vodorovné posuny (v pixelech) pro `count` souborů na jednom místě: řada vystředěná kolem lokality. */
export function deviceOffsetsPx(count: number, stepPx: number = 34): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.round((i - (count - 1) / 2) * stepPx));
  }
  return out;
}

/** Lokality a soubory, které nemají polohu — mapa je neukáže a uživatel je má doplnit. */
export function missingLocations(sites: ServiceSite[], devices: ServiceDevice[]): { sites: ServiceSite[]; devices: ServiceDevice[] } {
  const located = new Set(sites.filter((s) => !!siteCoordinates(s)).map((s) => s.number));
  return {
    sites: sites.filter((s) => s.isActive && !siteCoordinates(s)),
    devices: devices.filter((d) => d.isActive && !isValidCoordinates(d.latitude, d.longitude) && !located.has(d.siteNumber))
  };
}
