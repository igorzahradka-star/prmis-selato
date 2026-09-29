/**
 * Zákazníci a dodavatelé ze seznamu PRM_Partners.
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { Partner, PartnerType } from '../../core/types';
import { isDomestic } from '../../core/countries';
import { IPartnerRepository, PartnerFilter } from '../repositories';
import { getSp, describeSpError, extractStatus } from './spContext';

const PARTNERS_LIST = 'PRM_Partners';

const SELECT_FIELDS = [
  'Id',
  'Title',
  'PartnerType',
  'ICO',
  'DIC',
  'IsVatPayer',
  'Address',
  'ContactName',
  'Email',
  'Phone',
  'PaymentTermDays',
  'IsActive'
];

/**
 * Sloupec Země přibyl ve schématu 3. Do doplnění schématu (Správa → Instalace a diagnostika)
 * na webu ještě není a dotaz na něj by shodil celý seznam partnerů, proto se čte zvlášť
 * a když ho web nezná, načte se seznam bez něj.
 */
const OPTIONAL_FIELDS = ['Country'];

async function withOptionalFields<T>(run: (fields: string[]) => Promise<T>): Promise<T> {
  try {
    return await run([...SELECT_FIELDS, ...OPTIONAL_FIELDS]);
  } catch (error) {
    if (extractStatus(error) === 400) {
      return run(SELECT_FIELDS);
    }
    throw error;
  }
}

interface PartnerItem {
  Id: number;
  Title: string;
  PartnerType?: string;
  Country?: string;
  ICO?: string;
  DIC?: string;
  IsVatPayer?: boolean;
  Address?: string;
  ContactName?: string;
  Email?: string;
  Phone?: string;
  PaymentTermDays?: number;
  IsActive?: boolean;
}

export class SpPartnerRepository implements IPartnerRepository {
  public constructor(private readonly context: WebPartContext) {}

  public async list(filter?: PartnerFilter): Promise<Partner[]> {
    try {
      const sp = getSp(this.context);
      const items: PartnerItem[] = await withOptionalFields((fields) => {
        let query = sp.web.lists
          .getByTitle(PARTNERS_LIST)
          .items.select(...fields)
          .orderBy('Title')
          .top(2000);
        if (!filter?.includeInactive) {
          query = query.filter('IsActive eq 1');
        }
        return query();
      });
      const partners = items.map(mapPartner);
      return applyTextSearch(partners, filter?.search);
    } catch (error) {
      throw new Error(describeSpError(error, 'Nepodařilo se načíst seznam partnerů'));
    }
  }

  public async getById(id: number): Promise<Partner | undefined> {
    try {
      const sp = getSp(this.context);
      const item: PartnerItem = await withOptionalFields((fields) =>
        sp.web.lists
          .getByTitle(PARTNERS_LIST)
          .items.getById(id)
          .select(...fields)()
      );
      return mapPartner(item);
    } catch (error) {
      if (extractIsNotFound(error)) {
        return undefined;
      }
      throw new Error(describeSpError(error, `Nepodařilo se načíst partnera č. ${id}`));
    }
  }

  public async create(partner: Omit<Partner, 'id'>): Promise<Partner> {
    try {
      const sp = getSp(this.context);
      const result = await writeWithCountryFallback(partner, (payload) =>
        sp.web.lists.getByTitle(PARTNERS_LIST).items.add(payload)
      );
      const newId = extractAddedId(result);
      const created = newId !== undefined ? await this.getById(newId) : undefined;
      return created ?? { ...partner, id: newId ?? 0 };
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se uložit partnera „${partner.name}"`));
    }
  }

  public async update(id: number, partner: Omit<Partner, 'id'>): Promise<void> {
    try {
      const sp = getSp(this.context);
      await writeWithCountryFallback(partner, (payload) =>
        sp.web.lists.getByTitle(PARTNERS_LIST).items.getById(id).update(payload)
      );
    } catch (error) {
      throw new Error(describeSpError(error, `Nepodařilo se uložit partnera „${partner.name}"`));
    }
  }
}

/**
 * Zápis partnera. Sloupec Země přibyl ve schématu 3; než se schéma na webu doplní,
 * SharePoint zápis se sloupcem odmítne. Český partner se pak uloží bez něj (prázdná země
 * znamená Česko), zahraniční ne — zapsat ho bez země by z něj udělalo českou firmu.
 */
async function writeWithCountryFallback<T>(
  partner: Omit<Partner, 'id'>,
  run: (payload: Record<string, unknown>) => Promise<T>
): Promise<T> {
  const payload = toPayload(partner);
  try {
    return await run(payload);
  } catch (error) {
    if (extractStatus(error) !== 400) {
      throw error;
    }
    if (!isDomestic(partner.country)) {
      throw new Error(
        'Zahraničního partnera zatím nejde uložit: seznam partnerů na webu nemá sloupec Země. ' +
          'Otevřete Instalace a diagnostika a doplňte chybějící části (přidá jen sloupce, nic nesmaže).'
      );
    }
    const withoutCountry = { ...payload };
    delete withoutCountry.Country;
    return run(withoutCountry);
  }
}

function toPayload(partner: Omit<Partner, 'id'>): Record<string, unknown> {
  return {
    Title: partner.name,
    PartnerType: partner.partnerType,
    Country: partner.country ?? '',
    ICO: partner.ico ?? '',
    DIC: partner.dic ?? '',
    IsVatPayer: !!partner.isVatPayer,
    Address: partner.address ?? '',
    ContactName: partner.contactName ?? '',
    Email: partner.email ?? '',
    Phone: partner.phone ?? '',
    PaymentTermDays: partner.paymentTermDays ?? null,
    IsActive: partner.isActive
  };
}

function mapPartner(item: PartnerItem): Partner {
  return {
    id: item.Id,
    name: item.Title,
    partnerType: (item.PartnerType as PartnerType) ?? PartnerType.Zakaznik,
    country: item.Country || undefined,
    ico: item.ICO || undefined,
    dic: item.DIC || undefined,
    isVatPayer: !!item.IsVatPayer,
    address: item.Address || undefined,
    contactName: item.ContactName || undefined,
    email: item.Email || undefined,
    phone: item.Phone || undefined,
    paymentTermDays: item.PaymentTermDays,
    isActive: item.IsActive !== false
  };
}

/** Fulltext přes název, IČO a kontaktní osobu — stejně jako u projektů se dělá v prohlížeči. */
function applyTextSearch(partners: Partner[], search: string | undefined): Partner[] {
  if (!search || !search.trim()) {
    return partners;
  }
  const q = search.trim().toLocaleLowerCase('cs-CZ');
  return partners.filter((p) =>
    [p.name, p.ico, p.dic, p.contactName]
      .filter((v) => !!v)
      .some((v) => (v as string).toLocaleLowerCase('cs-CZ').indexOf(q) !== -1)
  );
}

function extractAddedId(added: unknown): number | undefined {
  const a = added as { data?: { Id?: number }; Id?: number };
  return a?.data?.Id ?? a?.Id;
}

function extractIsNotFound(error: unknown): boolean {
  const e = error as { status?: number; message?: string };
  return e?.status === 404 || /does not exist|404/i.test(e?.message ?? '');
}
