import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api-url';

interface WindowReference {
  windowId: string;
  referenceRegionId: string;
}

interface Source {
  id: string;
  title: string;
  url: string;
}

interface Applications extends WindowReference {
  applications: {
    type: 'rover_mobility' | 'geological_sampling' | 'field_operations';
    status: 'potential' | 'insufficient_evidence';
    description: string;
    missingEvidence: string[];
  }[];
}

interface EmitObservations {
  selectedGranule: string;
  screening: string;
  scenes: {
    granule: string;
    validPixels: number;
    windowPixels: number;
    coveragePercent: number;
    matches: { group: number; libraryId: number; label: string; pixels: number }[];
  }[];
}

interface ModisPeriod {
  mean: number | null;
  validPixels: number;
  coveragePercent: number;
  medianLocalSolarHour: number | null;
}

interface Geology extends WindowReference {
  status: 'qualitative' | 'unavailable';
  earth: {
    catalogCheck: { catalogHits: number; queryUrl: string } | null;
    emitObservations: EmitObservations | null;
  };
  planetary: {
    regionalContext: { observation: string; source: Source } | null;
    localizedSpectra: { source: Source; roi: string; localizedSamples: number } | null;
    mappedGeology: {
      coveragePercent: number;
      units: { code: string; name: string; percentOfWindow: number }[];
      source: Source;
      limitations: string[];
    } | null;
  };
  comparison: { commonMinerals: string[]; interpretation: string | null; limitations: string[] };
}

interface Thermal extends WindowReference {
  earth: {
    surfaceTemperature: {
      mean: number;
      units: string;
      validDays: number;
      period: { start: string; end: string };
      limitations: string[];
    } | null;
    source: Source | null;
    modisObservations: {
      start: string;
      end: string;
      units: string;
      daytime: ModisPeriod;
      nighttime: ModisPeriod;
    } | null;
  };
  planetary: {
    surfaceTemperature: {
      median: number;
      units: string;
      summary: string;
      samples: number;
      limitations: string[];
    } | null;
    source: Source | null;
  };
  comparison: { comparable: boolean; differenceK: number | null; reason: string };
}

type EvidenceStatus = 'available' | 'qualitative' | 'context_only' | 'catalogued' | 'not_evaluated';

interface Evidence extends WindowReference {
  dimensions: {
    topography: { status: EvidenceStatus };
    geology: { status: EvidenceStatus };
    thermal: { status: EvidenceStatus };
  };
  scientificReview: { status: 'pending' };
  sources: Source[];
  relatedStudies: { id: string; title: string }[];
}

interface Study extends WindowReference {
  id: string;
  title: string;
  researchQuestion: string;
  reviewStatus: 'pending';
  limitations: string[];
}

function assertPair<T extends WindowReference>(response: T, selection: WindowReference): T {
  if (
    response?.windowId !== selection.windowId ||
    response.referenceRegionId !== selection.referenceRegionId
  ) {
    throw new Error('La evidencia recibida no corresponde a la ventana y referencia solicitadas.');
  }
  return response;
}

@Injectable({ providedIn: 'root' })
export class WindowCharacterizationData {
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);

  forWindow(selection: WindowReference) {
    const url = this.api + '/discovered-candidates/' + encodeURIComponent(selection.windowId);
    const options = {
      params: { reference_region_id: selection.referenceRegionId },
      timeout: 12000,
    };
    return forkJoin({
      applications: this.http.get<Applications>(url + '/applications', options),
      geology: this.http.get<Geology>(url + '/geology', options),
      thermal: this.http.get<Thermal>(url + '/thermal', options),
      evidence: this.http.get<Evidence>(url + '/evidence', options),
    }).pipe(
      map(({ applications, geology, thermal, evidence }) => ({
        applications: assertPair(applications, selection),
        geology: assertPair(geology, selection),
        thermal: assertPair(thermal, selection),
        evidence: assertPair(evidence, selection),
      })),
    );
  }

  study(id: string, selection: WindowReference) {
    return this.http
      .get<Study>(this.api + '/analog-studies/' + encodeURIComponent(id), { timeout: 12000 })
      .pipe(
        map((response) => {
          const study = assertPair(response, selection);
          if (study.id !== id) {
            throw new Error('El caso recibido no corresponde al estudio seleccionado.');
          }
          return study;
        }),
      );
  }
}
