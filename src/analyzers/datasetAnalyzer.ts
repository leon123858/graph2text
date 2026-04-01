import { DatasetAnalysisResult, DatasetFinding, DatasetRow, FieldProfile, RelationFinding, SeriesFinding, TimePoint } from '../types.js';
import { MetricSemantics } from '../pipeline/metricSemantics.js';
import { DatasetProfiler } from '../pipeline/datasetProfiler.js';
import { Sessionizer } from '../pipeline/sessionizer.js';
import { MultiSeriesAnalyzer } from './multiSeriesAnalyzer.js';
import { SingleSeriesAnalyzer } from './singleSeriesAnalyzer.js';

function toTimePoints(rows: DatasetRow[], timestampField: string, valueField: string): TimePoint[] {
  return rows
    .map((row) => {
      const time = Number(row[timestampField]);
      const value = Number(row[valueField]);
      return Number.isFinite(time) && Number.isFinite(value) ? { time, value } : undefined;
    })
    .filter((point): point is TimePoint => point !== undefined);
}

function isAnalyzableField(fieldProfile: FieldProfile): boolean {
  return fieldProfile.role === 'continuous' || fieldProfile.role === 'counter';
}

function prioritizeFields(fieldProfiles: FieldProfile[]): FieldProfile[] {
  return [...fieldProfiles].sort((left, right) => {
    const leftMode = MetricSemantics.inferMetricMode(left.name, left.role);
    const rightMode = MetricSemantics.inferMetricMode(right.name, right.role);
    const leftScore =
      (leftMode === 'battery' ? 4 : 0) +
      (leftMode === 'dynamic' ? 3 : 0) +
      (leftMode === 'counter' ? 2 : 0) +
      (left.role === 'continuous' ? 3 : 0) +
      (left.role === 'counter' ? 2 : 0) +
      (left.qualityIssues.length === 0 ? 1 : 0);
    const rightScore =
      (rightMode === 'battery' ? 4 : 0) +
      (rightMode === 'dynamic' ? 3 : 0) +
      (rightMode === 'counter' ? 2 : 0) +
      (right.role === 'continuous' ? 3 : 0) +
      (right.role === 'counter' ? 2 : 0) +
      (right.qualityIssues.length === 0 ? 1 : 0);
    return rightScore - leftScore;
  });
}

function pickSessionFields(fieldProfiles: FieldProfile[]): FieldProfile[] {
  const ordered = prioritizeFields(fieldProfiles);
  const selected: FieldProfile[] = [];
  const coveredModes = new Set<string>();

  for (const field of ordered) {
    const mode = MetricSemantics.inferMetricMode(field.name, field.role);
    if (!coveredModes.has(mode) || selected.length < 2) {
      selected.push(field);
      coveredModes.add(mode);
    }
    if (selected.length >= 3) break;
  }

  return selected.length > 0 ? selected : ordered.slice(0, 3);
}

export class DatasetAnalyzer {
  public static process(rows: DatasetRow[]): DatasetAnalysisResult {
    const profile = DatasetProfiler.profile(rows);
    const sessionized = Sessionizer.sessionize(rows, profile.schema);
    const narratives: string[] = [];
    const findings: DatasetFinding[] = [];
    const analyzableFields = prioritizeFields(profile.fieldProfiles.filter(isAnalyzableField));
    const topSessions = profile.sessions.slice(0, 3);

    narratives.push(`Dataset Profiling Summary:

- Timestamp field: ${profile.schema.timestampField}
- Entity keys: ${profile.schema.entityFields.join(', ') || 'none'}
- Session keys: ${profile.schema.sessionFields.join(', ') || 'none'}
- Session count: ${profile.sessions.length}
- Analyzable metrics: ${analyzableFields.map((field) => field.name).join(', ') || 'none'}
`);

    if (topSessions.length === 0) {
      return { profile, narratives, findings };
    }

    for (const session of topSessions) {
      const rowsInSession = sessionized.sessions.get(session.id) ?? [];
      const perSessionFields = pickSessionFields(analyzableFields);
      const seriesFindings: SeriesFinding[] = [];
      let block = `Session ${session.id}\n`;
      block += `- Rows: ${session.rowCount}\n`;
      block += `- Time span: ${session.startTime} -> ${session.endTime}\n`;

      for (const field of perSessionFields) {
        const points = toTimePoints(rowsInSession, profile.schema.timestampField, field.name);
        if (points.length < 5) continue;
        const analysis = SingleSeriesAnalyzer.analyze(points, field.name, field.role);
        const highlights = SingleSeriesAnalyzer.buildHighlights(analysis.summary);
        seriesFindings.push({
          metric: field.name,
          role: field.role,
          metricMode: analysis.summary.metricMode,
          analysis,
          highlights,
        });
        block += `\n[${field.name} | ${field.role}]\n${analysis.narrative}\n`;
      }

      let relationFinding: RelationFinding | undefined;
      if (seriesFindings.length >= 2) {
        const first = seriesFindings[0];
        const second = seriesFindings[1];
        const pointsA = toTimePoints(rowsInSession, profile.schema.timestampField, first.metric);
        const pointsB = toTimePoints(rowsInSession, profile.schema.timestampField, second.metric);
        if (pointsA.length >= 5 && pointsB.length >= 5) {
          const analysis = MultiSeriesAnalyzer.analyze(pointsA, pointsB, first.metric, second.metric);
          relationFinding = {
            pair: [first.metric, second.metric],
            analysis,
            highlights: MultiSeriesAnalyzer.buildHighlights(analysis.summary),
          };
          block += `\n[${first.metric} <-> ${second.metric}]\n${analysis.narrative}\n`;
        }
      }

      findings.push({
        sessionId: session.id,
        rowCount: session.rowCount,
        startTime: session.startTime,
        endTime: session.endTime,
        seriesFindings,
        relationFinding,
      });
      narratives.push(block);
    }

    return { profile, narratives, findings };
  }
}
