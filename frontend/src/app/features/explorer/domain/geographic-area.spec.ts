import { describe, expect, it } from 'vitest';
import { areaFrom, areaFromPolygon, areaPolygon, containsCenter } from './geographic-area';

describe('rectángulo terrestre', () => {
  it('acepta el orden oeste, sur, este, norte e incluye los límites', () => {
    const area = areaFrom(['-69', '-23', '-68', '-22']);
    expect(area).toEqual([-69, -23, -68, -22]);
    if (!area) throw new Error('Área esperada');
    expect(areaFromPolygon(areaPolygon(area))).toEqual(area);
    expect(containsCenter(area, [-69, -22])).toBe(true);
    expect(containsCenter(area, [-69.01, -22])).toBe(false);
  });

  it('rechaza rectángulos degenerados, vacíos o que cruzan el antimeridiano', () => {
    for (const invalid of [
      [0, 0, 0, 1],
      [170, -10, -170, 10],
      [-170, -10, 170, 10],
      [0, 0, 5, 89],
      ['', 0, 1, 1],
    ]) {
      expect(areaFrom(invalid)).toBeUndefined();
    }
  });

  it('rechaza anillos cruzados o abiertos', () => {
    expect(
      areaFromPolygon({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        ],
      }),
    ).toBeUndefined();
    expect(
      areaFromPolygon({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 2],
          ],
        ],
      }),
    ).toBeUndefined();
  });
});
