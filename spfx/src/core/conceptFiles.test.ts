import { CONCEPT_MARK, conceptFileName, finalFileName, isConceptFileName } from './conceptFiles';

describe('koncepty souborů (KO)', () => {
  it('za název před příponou se přidá (KO)', () => {
    expect(conceptFileName('OBJ-2026-0001.pdf')).toBe('OBJ-2026-0001 (KO).pdf');
    expect(conceptFileName('Zapis_26001_Z007.docx')).toBe('Zapis_26001_Z007 (KO).docx');
    expect(conceptFileName('FP26006-001.pdf')).toBe('FP26006-001 (KO).pdf');
  });

  it('název s více tečkami dostane označení před poslední příponou; bez přípony na konec', () => {
    expect(conceptFileName('Zapis_26001_Z007.podepsano.pdf')).toBe('Zapis_26001_Z007.podepsano (KO).pdf');
    expect(conceptFileName('bez_pripony')).toBe(`bez_pripony${CONCEPT_MARK}`);
  });

  it('koncept se pozná a převede zpátky na ostrý název', () => {
    expect(isConceptFileName('OBJ-2026-0001 (KO).pdf')).toBe(true);
    expect(isConceptFileName('OBJ-2026-0001.pdf')).toBe(false);
    expect(isConceptFileName('(KO).pdf')).toBe(false);
    expect(finalFileName('OBJ-2026-0001 (KO).pdf')).toBe('OBJ-2026-0001.pdf');
    expect(finalFileName('OBJ-2026-0001.pdf')).toBe('OBJ-2026-0001.pdf');
  });

  it('převod tam a zpět dá původní název', () => {
    const names = ['OBJ-2026-0001.pdf', 'Zapis_26001_Z007.docx', 'FP26006-001.pdf', 'a.b.c.pdf'];
    names.forEach((n) => expect(finalFileName(conceptFileName(n))).toBe(n));
  });
});
