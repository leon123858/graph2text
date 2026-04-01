import { DatasetAnalysisResult, FeatureCard, LlmTextPayload, PromptSchemaPayload, RelationAnalysisResult, SeriesAnalysisResult } from '../types.js';

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.65) return 'medium';
  return 'low';
}

function renderCard(card: FeatureCard): string {
  const evidence = card.evidence.slice(0, 3).join(', ');
  return `- ${card.kind}: ${card.summary} [confidence=${confidenceLabel(card.confidence)}${evidence ? `; evidence=${evidence}` : ''}]`;
}

function toPromptSchema(cards: FeatureCard[], contextLines: string[]): PromptSchemaPayload {
  const observedFacts = cards.map((card) => `${card.title}: ${card.summary}`);
  const highConfidenceFacts = cards
    .filter((card) => card.confidence >= 0.85 && card.kind !== 'quality')
    .map((card) => `${card.title}: ${card.summary}`);
  const uncertainFacts = cards
    .filter((card) => card.confidence < 0.85 && card.kind !== 'quality')
    .map((card) => `${card.title}: ${card.summary}`);
  const doNotInfer = cards
    .filter((card) => card.kind === 'quality' || card.confidence < 0.65)
    .map((card) => `Do not over-interpret ${card.kind}: ${card.summary}`);
  const suggestedQuestions = cards.slice(0, 3).map((card) => `How should downstream reasoning use ${card.kind} given: ${card.summary}?`);

  const sections = [
    'CONTEXT',
    ...contextLines.map((line) => `- ${line}`),
    'OBSERVED FACTS',
    ...(observedFacts.length > 0 ? observedFacts.map((line) => `- ${line}`) : ['- none']),
    'HIGH CONFIDENCE FACTS',
    ...(highConfidenceFacts.length > 0 ? highConfidenceFacts.map((line) => `- ${line}`) : ['- none']),
    'UNCERTAIN FACTS',
    ...(uncertainFacts.length > 0 ? uncertainFacts.map((line) => `- ${line}`) : ['- none']),
    'DO NOT INFER',
    ...(doNotInfer.length > 0 ? doNotInfer.map((line) => `- ${line}`) : ['- none']),
    'SUGGESTED QUESTIONS',
    ...(suggestedQuestions.length > 0 ? suggestedQuestions.map((line) => `- ${line}`) : ['- none']),
  ];

  return {
    observedFacts,
    highConfidenceFacts,
    uncertainFacts,
    doNotInfer,
    suggestedQuestions,
    text: sections.join('\n'),
  };
}

export class LlmTextRenderer {
  public static renderSeries(result: SeriesAnalysisResult): LlmTextPayload {
    const summary = result.summary;
    const lines: string[] = [
      `SERIES ${summary.name}`,
      `- metric_mode: ${summary.metricMode ?? 'generic'}`,
      `- metric_subtype: ${summary.metricSubtype ?? 'generic'}`,
      `- samples: ${summary.sampleCount}`,
      `- trend: ${summary.trend}`,
      `- volatility: ${summary.volatility}`,
    ];

    if (summary.duration !== undefined) {
      lines.push(`- duration: ${summary.duration}`);
    }

    for (const card of result.featureCards.slice(0, 6)) {
      lines.push(renderCard(card));
    }

    return {
      text: lines.join('\n'),
      bulletLines: lines,
    };
  }

  public static renderSeriesPromptSchema(result: SeriesAnalysisResult): PromptSchemaPayload {
    const summary = result.summary;
    return toPromptSchema(result.featureCards, [
      `series=${summary.name}`,
      `metric_mode=${summary.metricMode ?? 'generic'}`,
      `metric_subtype=${summary.metricSubtype ?? 'generic'}`,
      `samples=${summary.sampleCount}`,
      `trend=${summary.trend}`,
      `volatility=${summary.volatility}`,
    ]);
  }

  public static renderRelation(result: RelationAnalysisResult): LlmTextPayload {
    const summary = result.summary;
    const lines: string[] = [
      `RELATION ${summary.nameA} -> ${summary.nameB}`,
      `- metric_a: ${summary.metricModeA ?? 'generic'} / ${summary.metricSubtypeA ?? 'generic'}`,
      `- metric_b: ${summary.metricModeB ?? 'generic'} / ${summary.metricSubtypeB ?? 'generic'}`,
      `- aligned_points: ${summary.alignedPoints}`,
      `- coverage_ratio: ${summary.coverageRatio.toFixed(3)}`,
      `- static_correlation: ${summary.staticCorrelation.toFixed(3)}`,
      `- best_lag: ${summary.bestLag}`,
      `- best_lag_correlation: ${summary.bestCorrelation.toFixed(3)}`,
    ];

    for (const card of result.featureCards.slice(0, 6)) {
      lines.push(renderCard(card));
    }

    return {
      text: lines.join('\n'),
      bulletLines: lines,
    };
  }

  public static renderRelationPromptSchema(result: RelationAnalysisResult): PromptSchemaPayload {
    const summary = result.summary;
    return toPromptSchema(result.featureCards, [
      `relation=${summary.nameA}->${summary.nameB}`,
      `metric_a=${summary.metricModeA ?? 'generic'}/${summary.metricSubtypeA ?? 'generic'}`,
      `metric_b=${summary.metricModeB ?? 'generic'}/${summary.metricSubtypeB ?? 'generic'}`,
      `aligned_points=${summary.alignedPoints}`,
      `coverage_ratio=${summary.coverageRatio.toFixed(3)}`,
      `static_correlation=${summary.staticCorrelation.toFixed(3)}`,
      `best_lag=${summary.bestLag}`,
    ]);
  }

  public static renderDataset(result: DatasetAnalysisResult): LlmTextPayload {
    const lines: string[] = [
      `DATASET`,
      `- timestamp_field: ${result.profile.schema.timestampField}`,
      `- entity_fields: ${result.profile.schema.entityFields.join(', ') || 'none'}`,
      `- session_fields: ${result.profile.schema.sessionFields.join(', ') || 'none'}`,
      `- session_count: ${result.profile.sessions.length}`,
      `- profiled_fields: ${result.profile.fieldProfiles.length}`,
    ];

    for (const finding of result.findings.slice(0, 3)) {
      lines.push(`SESSION ${finding.sessionId}`);
      lines.push(`- rows: ${finding.rowCount}`);
      lines.push(`- time_span: ${finding.startTime} -> ${finding.endTime}`);

      for (const seriesFinding of finding.seriesFindings.slice(0, 3)) {
        lines.push(`- series: ${seriesFinding.metric} (${seriesFinding.metricMode ?? 'generic'})`);
        for (const card of seriesFinding.analysis.featureCards.slice(0, 3)) {
          lines.push(`  ${renderCard(card).slice(2)}`);
        }
      }

      if (finding.relationFinding) {
        lines.push(`- relation: ${finding.relationFinding.pair.join(' <-> ')}`);
        for (const card of finding.relationFinding.analysis.featureCards.slice(0, 3)) {
          lines.push(`  ${renderCard(card).slice(2)}`);
        }
      }
    }

    return {
      text: lines.join('\n'),
      bulletLines: lines,
    };
  }

  public static renderDatasetPromptSchema(result: DatasetAnalysisResult): PromptSchemaPayload {
    const cards: FeatureCard[] = [];
    const contextLines = [
      `timestamp_field=${result.profile.schema.timestampField}`,
      `entity_fields=${result.profile.schema.entityFields.join(', ') || 'none'}`,
      `session_fields=${result.profile.schema.sessionFields.join(', ') || 'none'}`,
      `session_count=${result.profile.sessions.length}`,
      `profiled_fields=${result.profile.fieldProfiles.length}`,
    ];

    for (const finding of result.findings.slice(0, 3)) {
      for (const seriesFinding of finding.seriesFindings.slice(0, 2)) {
        cards.push(...seriesFinding.analysis.featureCards.slice(0, 2));
      }
      if (finding.relationFinding) {
        cards.push(...finding.relationFinding.analysis.featureCards.slice(0, 2));
      }
    }

    return toPromptSchema(cards, contextLines);
  }
}
