import { ALL_MODULES, isModuleEnabled, withEnabledModules } from './modules';
import { ENTITY } from '../config/entity';

describe('moduly', () => {
  test('věc bez modulu je vidět vždy', () => {
    expect(isModuleEnabled(undefined, { abra: false, service: false })).toBe(true);
  });

  test('věc modulu jen se zapnutým modulem', () => {
    expect(isModuleEnabled('abra', { abra: false, service: true })).toBe(false);
    expect(isModuleEnabled('service', { abra: false, service: true })).toBe(true);
  });

  test('withEnabledModules vyřadí jen položky vypnutých modulů', () => {
    const items = [{ id: 1 }, { id: 2, module: 'abra' as const }, { id: 3, module: 'service' as const }];
    expect(withEnabledModules(items, { abra: false, service: true }).map((i) => i.id)).toEqual([1, 3]);
    expect(withEnabledModules(items, ALL_MODULES).map((i) => i.id)).toEqual([1, 2, 3]);
  });

  test('SELATO: Abra i Servis jsou vypnuté (rozhodnutí 10. 11. 2026)', () => {
    expect(ENTITY.modules).toEqual({ abra: false, service: false });
  });
});
