import { DataQualityIssue, DatasetRow, FieldProfile, FieldRole } from '../types.js';

interface NumericSummary {
  values: number[];
  nonNullCount: number;
  uniqueCount: number;
  min?: number;
  max?: number;
  mean?: number;
  zeroRatio?: number;
  integerRatio?: number;
  monotonicIncreaseRatio?: number;
  medianDelta?: number;
}

function toNumeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function computeNumericSummary(rows: DatasetRow[], fieldName: string): NumericSummary {
  const values: number[] = [];
  const unique = new Set<number>();
  let sum = 0;
  let min: number | undefined;
  let max: number | undefined;
  let zeroCount = 0;
  let integerCount = 0;
  let nonNegativeDiffs = 0;
  let diffCount = 0;
  const deltas: number[] = [];
  let previous: number | undefined;

  for (const row of rows) {
    const current = toNumeric(row[fieldName]);
    if (current === undefined) continue;

    values.push(current);
    unique.add(current);
    sum += current;
    if (current === 0) zeroCount++;
    if (Number.isInteger(current)) integerCount++;
    if (min === undefined || current < min) min = current;
    if (max === undefined || current > max) max = current;

    if (previous !== undefined) {
      const delta = current - previous;
      deltas.push(delta);
      diffCount++;
      if (delta >= 0) nonNegativeDiffs++;
    }
    previous = current;
  }

  deltas.sort((a, b) => a - b);
  const medianDelta = deltas.length === 0 ? undefined : deltas[Math.floor(deltas.length / 2)];

  return {
    values,
    nonNullCount: values.length,
    uniqueCount: unique.size,
    min,
    max,
    mean: values.length === 0 ? undefined : sum / values.length,
    zeroRatio: values.length === 0 ? undefined : zeroCount / values.length,
    integerRatio: values.length === 0 ? undefined : integerCount / values.length,
    monotonicIncreaseRatio: diffCount === 0 ? undefined : nonNegativeDiffs / diffCount,
    medianDelta,
  };
}

function detectDerivedField(
  fieldName: string,
  summaries: Map<string, NumericSummary>
): string | undefined {
  const target = summaries.get(fieldName);
  if (!target || target.values.length < 4) return undefined;

  for (const [otherName, other] of summaries.entries()) {
    if (otherName === fieldName || other.values.length !== target.values.length) continue;

    let diffMin = Number.POSITIVE_INFINITY;
    let diffMax = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < target.values.length; i++) {
      const diff = target.values[i] - other.values[i];
      if (diff < diffMin) diffMin = diff;
      if (diff > diffMax) diffMax = diff;
      if (diffMax - diffMin > 1e-6) break;
    }

    if (diffMax - diffMin <= 1e-6) {
      return otherName;
    }
  }

  return undefined;
}

function inferRole(fieldName: string, summary: NumericSummary, derivedFrom?: string): FieldRole {
  const normalizedName = fieldName.toLowerCase();

  if (derivedFrom) return 'derived';
  if (summary.nonNullCount === 0) return 'unknown';
  if (summary.uniqueCount <= 1) return 'constant';
  if (/(^ts$|time|timestamp|date)/.test(normalizedName)) return 'timestamp';
  if (/(imei|vin|device|vehicle|asset|id$)/.test(normalizedName)) return 'entity_key';
  if (/(trip|session|segment|route|cycle)/.test(normalizedName)) return 'session_key';
  if ((summary.uniqueCount <= 8 && (summary.integerRatio ?? 0) > 0.95) || /(state|mode|flag|status|gear|ign)/.test(normalizedName)) {
    return 'state';
  }
  if (
    /(odo|odometer|mileage|counter|total|accum)/.test(normalizedName) ||
    ((summary.monotonicIncreaseRatio ?? 0) > 0.98 && (summary.zeroRatio ?? 0) < 0.95 && summary.uniqueCount > 8)
  ) {
    return 'counter';
  }
  if (summary.uniqueCount > 4) return 'continuous';
  return 'unknown';
}

export class FieldClassifier {
  public static profileFields(rows: DatasetRow[]): FieldProfile[] {
    if (rows.length === 0) return [];

    const fieldNames = Object.keys(rows[0]);
    const numericSummaries = new Map<string, NumericSummary>();

    for (const fieldName of fieldNames) {
      numericSummaries.set(fieldName, computeNumericSummary(rows, fieldName));
    }

    return fieldNames.map((fieldName) => {
      const summary = numericSummaries.get(fieldName)!;
      const derivedFrom = detectDerivedField(fieldName, numericSummaries);
      const role = inferRole(fieldName, summary, derivedFrom);
      const qualityIssues: DataQualityIssue[] = [];

      if (role === 'constant') {
        qualityIssues.push({
          code: 'constant_series',
          severity: 'warning',
          message: `[${fieldName}] is effectively constant and should be excluded from feature extraction.`,
        });
      }

      if (role === 'derived' && derivedFrom) {
        qualityIssues.push({
          code: 'derived_field',
          severity: 'warning',
          message: `[${fieldName}] appears to be a deterministic transform of [${derivedFrom}].`,
        });
      }

      return {
        name: fieldName,
        role,
        nonNullCount: summary.nonNullCount,
        uniqueCount: summary.uniqueCount,
        min: summary.min,
        max: summary.max,
        mean: summary.mean,
        zeroRatio: summary.zeroRatio,
        integerRatio: summary.integerRatio,
        monotonicIncreaseRatio: summary.monotonicIncreaseRatio,
        medianDelta: summary.medianDelta,
        derivedFrom,
        qualityIssues,
      };
    });
  }
}
