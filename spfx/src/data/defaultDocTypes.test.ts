import { DEFAULT_DOC_TYPES, findDefaultDocType } from './defaultDocTypes';
import { renderDocumentNumber } from '../core/numbering';

describe('výchozí číselné řady', () => {
  it('kódy jsou jedinečné a obsahují řady pro projekty, objednávky, fakturaci a protokoly', () => {
    const kody = DEFAULT_DOC_TYPES.map((d) => d.code);
    expect(new Set(kody).size).toBe(kody.length);
    expect(kody).toEqual(expect.arrayContaining(['PRJ', 'OBJ', 'FP', 'PP']));
  });

  it('objednávky se číslují OBJ-ROK-pořadí na čtyři místa', () => {
    const obj = findDefaultDocType('OBJ');
    expect(obj).toBeDefined();
    expect(renderDocumentNumber(obj as NonNullable<typeof obj>, { prefix: 'OBJ', year: 2026, sequence: 5 })).toBe('OBJ-2026-0005');
  });

  it('neznámý kód nemá výchozí řadu', () => {
    expect(findDefaultDocType('XYZ')).toBeUndefined();
  });

  it('všechny výchozí řady jsou aktivní', () => {
    expect(DEFAULT_DOC_TYPES.every((d) => d.active)).toBe(true);
  });
});
