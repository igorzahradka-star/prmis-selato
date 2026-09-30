import { describeApprovalLadder, approvalTierIndex } from './approval';
import { ApprovalSettings } from './settings';
import { normalizeSpaces } from './format';

const limity: ApprovalSettings = {
  pmLimit: 100000,
  vedeniLimit: 500000,
  jednatelLimit: 1000000,
  pmSelfApprovalEnabled: true,
  overheadRequiresVedeni: true,
  eurRateForLimits: 25,
  usdRateForLimits: 23
};

describe('describeApprovalLadder', () => {
  it('popíše všechna čtyři pásma', () => {
    const rows = describeApprovalLadder(limity).map(normalizeSpaces);
    expect(rows[0]).toBe('do 100 000 Kč schvaluje projektový manažer');
    expect(rows[1]).toBe('nad 100 000 Kč do 500 000 Kč schvaluje navíc vedení');
    expect(rows[2]).toBe('nad 500 000 Kč do 1 000 000 Kč schvaluje navíc jednatel');
    expect(rows[3]).toBe('nad 1 000 000 Kč se objednávka schvaluje mimo aplikaci');
  });

  it('vysvětlí, že si PM schvaluje sám, když je to zapnuté', () => {
    const rows = describeApprovalLadder(limity);
    expect(rows.some((r) => r.indexOf('schvaluje sám') !== -1)).toBe(true);
  });

  it('při vypnutém samoschválení řekne opak', () => {
    const rows = describeApprovalLadder({ ...limity, pmSelfApprovalEnabled: false });
    expect(rows.some((r) => r.indexOf('schvaluje sám') !== -1)).toBe(false);
    expect(rows.some((r) => r.indexOf('i vlastní objednávku') !== -1)).toBe(true);
  });

  it('zmíní Režii, jen když ji vedení opravdu schvaluje vždy', () => {
    expect(describeApprovalLadder(limity).some((r) => r.indexOf('Režie') !== -1)).toBe(true);
    expect(
      describeApprovalLadder({ ...limity, overheadRequiresVedeni: false }).some(
        (r) => r.indexOf('Režie') !== -1
      )
    ).toBe(false);
  });
});

describe('approvalTierIndex', () => {
  it('částka v limitu PM je nejnižší pásmo', () => {
    expect(approvalTierIndex(50000, limity)).toBe(0);
  });

  it('hranice patří do nižšího pásma, ne do vyššího', () => {
    expect(approvalTierIndex(100000, limity)).toBe(0);
    expect(approvalTierIndex(500000, limity)).toBe(1);
    expect(approvalTierIndex(1000000, limity)).toBe(2);
  });

  it('koruna nad hranicí už patří výš', () => {
    expect(approvalTierIndex(100001, limity)).toBe(1);
    expect(approvalTierIndex(500001, limity)).toBe(2);
    expect(approvalTierIndex(1000001, limity)).toBe(3);
  });

  it('nula spadá do nejnižšího pásma', () => {
    expect(approvalTierIndex(0, limity)).toBe(0);
  });
});
