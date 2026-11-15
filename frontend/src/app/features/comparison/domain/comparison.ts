import type { DatasetStatus, Metric, MetricKey } from '../../../core/data/analog-dataset.model';

export interface ComparisonRequest {
  readonly reference_region_id: string;
  readonly site_ids: readonly string[];
}

export interface ServerComparisonRow {
  readonly key: MetricKey;
  readonly reference: Metric | null;
  readonly sites: readonly (Metric | null)[];
  readonly comparable: boolean;
  readonly signed_differences: readonly (number | null)[];
  readonly reason: string | null;
}

export interface ComparisonResult {
  readonly reference_region_id: string;
  readonly site_ids: readonly string[];
  readonly rows: readonly ServerComparisonRow[];
  readonly dataset_status: DatasetStatus;
  readonly notice: string;
}
