import { TILE_SIZE, mapView, worldPixel } from './mapTiles';

describe('dlaždice mapy', () => {
  it('bod 0°, 0° leží uprostřed světa', () => {
    const p = worldPixel(0, 0, 1);
    expect(p.x).toBeCloseTo(TILE_SIZE, 5);
    expect(p.y).toBeCloseTo(TILE_SIZE, 5);
  });

  it('výřez kolem Havlíčkova Brodu: dlaždice pokrývají celý obrázek a značka je uprostřed', () => {
    const v = mapView(49.6078, 15.5806, 11, 600, 400);
    expect(v.marker).toEqual({ x: 300, y: 200 });
    expect(v.tiles.length).toBeGreaterThanOrEqual(6);
    v.tiles.forEach((t) => {
      expect(t.tx).toBeGreaterThanOrEqual(0);
      expect(t.ty).toBeGreaterThanOrEqual(0);
    });
    const minLeft = Math.min(...v.tiles.map((t) => t.left));
    const maxRight = Math.max(...v.tiles.map((t) => t.left + TILE_SIZE));
    const minTop = Math.min(...v.tiles.map((t) => t.top));
    const maxBottom = Math.max(...v.tiles.map((t) => t.top + TILE_SIZE));
    expect(minLeft).toBeLessThanOrEqual(0);
    expect(maxRight).toBeGreaterThanOrEqual(600);
    expect(minTop).toBeLessThanOrEqual(0);
    expect(maxBottom).toBeGreaterThanOrEqual(400);
  });

  it('přes okraj světa se dlaždice zalomí, nahoře a dole se vynechají', () => {
    const v = mapView(0, 179.99, 3, 600, 400);
    expect(v.tiles.every((t) => t.tx >= 0 && t.tx < 8)).toBe(true);
    const polar = mapView(85, 0, 2, 600, 600);
    expect(polar.tiles.every((t) => t.ty >= 0 && t.ty < 4)).toBe(true);
  });
});
