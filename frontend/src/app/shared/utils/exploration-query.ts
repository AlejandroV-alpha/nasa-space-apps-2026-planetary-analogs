import type { ParamMap } from '@angular/router';
import type { ReferenceRegion, Site } from '../../core/data/analog-dataset.model';

export function resolveExploration<
  Region extends Pick<ReferenceRegion, 'id' | 'targetBody'>,
  Candidate extends Pick<Site, 'id'> & {
    readonly assessments: readonly { readonly referenceRegionId: string }[];
  },
>(
  params: ParamMap,
  dataset:
    | { readonly referenceRegions: readonly Region[]; readonly sites: readonly Candidate[] }
    | undefined,
) {
  const requestedBody = params.get('cuerpo');
  const requestedRegion = params.get('region');
  const byId = dataset?.referenceRegions.find((region) => region.id === requestedRegion);
  const body =
    requestedBody === 'moon' || requestedBody === 'mars'
      ? requestedBody
      : (byId?.targetBody ?? 'mars');
  const regions = dataset?.referenceRegions.filter((region) => region.targetBody === body) ?? [];
  const region = regions.find((candidate) => candidate.id === requestedRegion) ?? regions[0];
  const candidates =
    dataset?.sites.filter((site) =>
      site.assessments.some((assessment) => assessment.referenceRegionId === region?.id),
    ) ?? [];
  const requestedSites = (params.get('sitios') ?? '').split(',').filter(Boolean);
  const compatibleIds = new Set(candidates.map((site) => site.id));
  const siteIds = Array.from(new Set(requestedSites))
    .filter((id) => compatibleIds.has(id))
    .slice(0, 3);
  const selected = candidates.find((site) => site.id === params.get('sitio'));
  const invalid =
    (requestedBody !== null && requestedBody !== body) ||
    (requestedRegion !== null && requestedRegion !== region?.id) ||
    requestedSites.length !== siteIds.length ||
    (params.has('sitio') && !selected);

  return { body, regions, region, candidates, siteIds, selected, invalid };
}

export function explorationQuery(
  region: ReferenceRegion | undefined,
  siteIds: readonly string[],
  selected?: string,
) {
  return {
    cuerpo: region?.targetBody,
    region: region?.id,
    sitios: siteIds.length ? siteIds.join(',') : null,
    sitio: selected ?? null,
  };
}

export function toggleCandidate(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) {
    return ids.filter((item) => item !== id);
  }
  if (ids.length >= 3) {
    return Array.from(ids);
  }

  return ids.concat(id);
}
