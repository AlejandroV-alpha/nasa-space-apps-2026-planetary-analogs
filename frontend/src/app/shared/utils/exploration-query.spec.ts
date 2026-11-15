import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { resolveExploration, toggleCandidate } from './exploration-query';
import { metricValue, validEarthPosition } from './science-format';

const dataset = {
  referenceRegions: [
    { id: 'lunar', targetBody: 'moon' },
    { id: 'jezero', targetBody: 'mars' },
  ],
  sites: [
    { id: 'siloli', assessments: [{ referenceRegionId: 'jezero' }] },
    { id: 'coipasa', assessments: [{ referenceRegionId: 'jezero' }] },
    { id: 'amboy', assessments: [{ referenceRegionId: 'lunar' }] },
  ],
} as const;

describe('exploration URL', () => {
  it('infers the body from the region and keeps ordered compatible sites', () => {
    const state = resolveExploration(
      convertToParamMap({ region: 'jezero', sitios: 'coipasa,siloli' }),
      dataset,
    );
    expect(state.body).toBe('mars');
    expect(state.siteIds).toEqual(['coipasa', 'siloli']);
    expect(state.invalid).toBe(false);
  });

  it('recovers from mismatched regions and unknown sites', () => {
    const state = resolveExploration(
      convertToParamMap({
        cuerpo: 'moon',
        region: 'jezero',
        sitios: 'siloli,amboy,amboy',
        sitio: 'missing',
      }),
      dataset,
    );
    expect(state.region?.id).toBe('lunar');
    expect(state.siteIds).toEqual(['amboy']);
    expect(state.selected).toBeUndefined();
    expect(state.invalid).toBe(true);
  });

  it('allows removal at the selection limit', () => {
    expect(toggleCandidate(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
    expect(toggleCandidate(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('scientific display', () => {
  it('distinguishes zero from a missing measurement', () => {
    expect(metricValue(0, 'deg', true)).toBe('0°');
    expect(metricValue(null, 'deg', true)).toBe('Sin dato');
  });

  it('rejects invalid terrestrial coordinates', () => {
    expect(validEarthPosition([0, 0])).toBe(true);
    expect(validEarthPosition([181, 0])).toBe(false);
    expect(validEarthPosition([0, Number.NaN])).toBe(false);
    expect(validEarthPosition(undefined)).toBe(false);
  });
});
