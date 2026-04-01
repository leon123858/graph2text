import { DatasetAnalysisResult, DatasetRow, FieldProfile, TimePoint } from '../types.js';
import { DatasetProfiler } from '../pipeline/datasetProfiler.js';
import { Sessionizer } from '../pipeline/sessionizer.js';
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

export class DatasetAnalyzer {
  public static process(rows: DatasetRow[]): DatasetAnalysisResult {
    const profile = DatasetProfiler.profile(rows);
    const sessionized = Sessionizer.sessionize(rows, profile.schema);
    const narratives: string[] = [];
    const analyzableFields = profile.fieldProfiles.filter(isAnalyzableField);
    const topSessions = profile.sessions.slice(0, 3);

    narratives.push(`Dataset Profiling Summary:

- Timestamp field: ${profile.schema.timestampField}
- Entity keys: ${profile.schema.entityFields.join(', ') || 'none'}
- Session keys: ${profile.schema.sessionFields.join(', ') || 'none'}
- Session count: ${profile.sessions.length}
- Analyzable metrics: ${analyzableFields.map((field) => field.name).join(', ') || 'none'}
`);

    if (topSessions.length === 0) {
      return { profile, narratives };
    }

    for (const session of topSessions) {
      const rowsInSession = sessionized.sessions.get(session.id) ?? [];
      const perSessionFields = analyzableFields.slice(0, 3);
      let block = `Session ${session.id}\n`;
      block += `- Rows: ${session.rowCount}\n`;
      block += `- Time span: ${session.startTime} -> ${session.endTime}\n`;

      for (const field of perSessionFields) {
        const points = toTimePoints(rowsInSession, profile.schema.timestampField, field.name);
        if (points.length < 5) continue;
        block += `\n[${field.name}]\n${SingleSeriesAnalyzer.process(points, field.name)}\n`;
      }

      narratives.push(block);
    }

    return { profile, narratives };
  }
}
