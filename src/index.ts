import { DatasetAnalyzer } from './analyzers/datasetAnalyzer.js';
import { MultiSeriesAnalyzer } from './analyzers/multiSeriesAnalyzer.js';
import { LlmTextRenderer } from './pipeline/llmTextRenderer.js';
import { SingleSeriesAnalyzer } from './analyzers/singleSeriesAnalyzer.js';
import { DatasetAnalysisResult, DatasetRow, FieldRole, LlmTextPayload, PromptSchemaPayload, RelationAnalysisResult, SeriesAnalysisResult, TimePoint } from './types.js';

export class SemanticFeatureEngine {
  public static analyzeDataset(rows: DatasetRow[]): DatasetAnalysisResult {
    return DatasetAnalyzer.process(rows);
  }

  public static analyzeDatasetForLLM(rows: DatasetRow[]): LlmTextPayload {
    return LlmTextRenderer.renderDataset(DatasetAnalyzer.process(rows));
  }

  public static analyzeDatasetForPrompt(rows: DatasetRow[]): PromptSchemaPayload {
    return LlmTextRenderer.renderDatasetPromptSchema(DatasetAnalyzer.process(rows));
  }

  public static analyzeSingleStructured(data: TimePoint[], name?: string, role?: FieldRole): SeriesAnalysisResult {
    const fallbackName = name ?? 'Unknown Metric';
    return SingleSeriesAnalyzer.analyze(data, fallbackName, role);
  }

  public static analyzeSingleForLLM(data: TimePoint[], name?: string, role?: FieldRole): LlmTextPayload {
    const fallbackName = name ?? 'Unknown Metric';
    return LlmTextRenderer.renderSeries(SingleSeriesAnalyzer.analyze(data, fallbackName, role));
  }

  public static analyzeSingleForPrompt(data: TimePoint[], name?: string, role?: FieldRole): PromptSchemaPayload {
    const fallbackName = name ?? 'Unknown Metric';
    return LlmTextRenderer.renderSeriesPromptSchema(SingleSeriesAnalyzer.analyze(data, fallbackName, role));
  }

  public static analyzeSingle(data: TimePoint[], name?: string, role?: FieldRole): string {
    const fallbackName = name ?? 'Unknown Metric';
    if (!data || data.length === 0) {
      return `No observation data available for [${fallbackName}].`;
    }
    return SingleSeriesAnalyzer.process(data, name ?? 'Metric', role);
  }

  public static analyzeRelationStructured(dataA: TimePoint[], dataB: TimePoint[], nameA?: string, nameB?: string): RelationAnalysisResult {
    return MultiSeriesAnalyzer.analyze(dataA, dataB, nameA ?? 'Metric A', nameB ?? 'Metric B');
  }

  public static analyzeRelationForLLM(dataA: TimePoint[], dataB: TimePoint[], nameA?: string, nameB?: string): LlmTextPayload {
    return LlmTextRenderer.renderRelation(MultiSeriesAnalyzer.analyze(dataA, dataB, nameA ?? 'Metric A', nameB ?? 'Metric B'));
  }

  public static analyzeRelationForPrompt(dataA: TimePoint[], dataB: TimePoint[], nameA?: string, nameB?: string): PromptSchemaPayload {
    return LlmTextRenderer.renderRelationPromptSchema(MultiSeriesAnalyzer.analyze(dataA, dataB, nameA ?? 'Metric A', nameB ?? 'Metric B'));
  }

  public static analyzeRelation(dataA: TimePoint[], dataB: TimePoint[], nameA?: string, nameB?: string): string {
    if (!dataA || !dataB || dataA.length === 0 || dataB.length === 0) {
      return 'Data arrays cannot be empty.';
    }
    return MultiSeriesAnalyzer.process(dataA, dataB, nameA ?? 'Metric A', nameB ?? 'Metric B');
  }
}

export * from './types.js';
