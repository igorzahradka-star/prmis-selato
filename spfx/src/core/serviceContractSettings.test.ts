import { contractSettingsWithDefaults, DEFAULT_CONTRACT_SETTINGS, validateContractSettings } from './serviceContractSettings';
import { serviceSettingsWithDefaults } from './serviceSla';

describe('nastavení smluv', () => {
  it('bez uloženého nastavení dá výchozí, a to nikdy sdílenou kopii', () => {
    const a = contractSettingsWithDefaults(undefined);
    expect(a).toEqual(DEFAULT_CONTRACT_SETTINGS);
    a.eskalace[0].res = 'jiné';
    expect(contractSettingsWithDefaults(undefined).eskalace[0].res).toBe('Vedoucí servisu');
  });

  it('zhotovitel je podle rejstříku a ukázkové ceny se nepřebírají', () => {
    const d = DEFAULT_CONTRACT_SETTINGS;
    expect(d.zhotovitel.ico).toBe('29713536');
    expect(d.zhotovitel.nazev).toContain('s.r.o.');
    expect(d.sazebnik).toEqual([]);
    expect(d.kontakty).toEqual([]);
    expect(d.parametry.doba_let).toBe(10);
  });

  it('uložená hodnota přebije výchozí a chybějící se doplní', () => {
    const s = contractSettingsWithDefaults({ parametry: { splatnost_dni: 45 } as never, zhotovitel: { dispecink_tel: '+420 1' } as never });
    expect(s.parametry.splatnost_dni).toBe(45);
    expect(s.parametry.doba_let).toBe(10);
    expect(s.zhotovitel.dispecink_tel).toBe('+420 1');
    expect(s.zhotovitel.ico).toBe('29713536');
  });

  it('nastavení servisu obsahuje smlouvy i u starého uloženého nastavení bez nich', () => {
    expect(serviceSettingsWithDefaults({ folderRoot: 'General/02_SERVIS' }).contract.parametry.doba_let).toBe(10);
  });

  it('kontrola zachytí špatná čísla, prázdné položky a IČO', () => {
    const s = contractSettingsWithDefaults(undefined);
    expect(validateContractSettings(s)).toEqual([]);
    s.parametry.doba_let = 0;
    s.sazebnik = [{ polozka: '', jednotka: 'hod', cena: -1 }];
    s.autorizaceOem = [{ vyrobce: ' ', rozsah: '', doklad: '', platnost_do: '' }];
    s.zhotovitel.ico = '123';
    expect(validateContractSettings(s)).toHaveLength(5);
  });
});
