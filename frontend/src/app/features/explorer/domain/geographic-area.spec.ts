import { describe, expect, it } from 'vitest';
import { areaFrom, areaFromPolygon, areaPolygon, areaSegments } from './geographic-area';

describe('rectángulo terrestre', () => {
  it('acepta el orden oeste, sur, este, norte', () => {
    const area = areaFrom(['-69', '-23', '-68', '-22']);
    expect(area).toEqual([-69, -23, -68, -22]);
    if (!area) throw new Error('Área esperada');
    expect(areaFromPolygon(areaPolygon(area))).toEqual(area);
    expect(areaSegments(area)).toEqual([area]);
  });

  it('rechaza rectángulos degenerados, vacíos o de ancho ambiguo', () => {
    for (const invalid of [
      [0, 0, 0, 1],
      [180, -10, -180, 10],
      [-170, -10, 170, 10],
      [0, 0, 5, 89],
      ['', 0, 1, 1],
    ]) {
      expect(areaFrom(invalid)).toBeUndefined();
    }
  });

  it('divide una selección explícita del antimeridiano en rectángulos REST válidos', () => {
    const area = areaFrom([170, -10, -170, 10]);
    if (!area) throw new Error('Área esperada');

    expect(areaSegments(area)).toEqual([
      [170, -10, 180, 10],
      [-180, -10, -170, 10],
    ]);
    expect(areaSegments([180, -10, -170, 10])).toEqual([[-180, -10, -170, 10]]);
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
