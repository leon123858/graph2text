import { DatasetAnalyzer } from './analyzers/datasetAnalyzer.js';
import { SingleSeriesAnalyzer } from './analyzers/singleSeriesAnalyzer.js';
import { MultiSeriesAnalyzer } from './analyzers/multiSeriesAnalyzer.js';
import { DatasetAnalysisResult, DatasetRow, TimePoint } from './types.js';

export class SemanticFeatureEngine {
  public static analyzeDataset(rows: DatasetRow[]): DatasetAnalysisResult {
    return DatasetAnalyzer.process(rows);
  }

  public static analyzeSingle(data: TimePoint[], name?: string): string {
    const fallbackName = name ?? 'Unknown Metric';
    if (!data || data.length === 0) {
      return `No observation data available for [${fallbackName}].`;
    }
    return SingleSeriesAnalyzer.process(data, name ?? 'Metric');
  }

  public static analyzeRelation(dataA: TimePoint[], dataB: TimePoint[], nameA?: string, nameB?: string): string {
    if (!dataA || !dataB || dataA.length === 0 || dataB.length === 0) {
      return 'Data arrays cannot be empty.';
    }
    return MultiSeriesAnalyzer.process(dataA, dataB, nameA ?? 'Metric A', nameB ?? 'Metric B');
  }
}

export * from './types.js';
