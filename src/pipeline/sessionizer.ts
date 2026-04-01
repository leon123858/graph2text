import { DatasetRow, DatasetSchema, SessionDescriptor } from '../types.js';

export interface SessionizedDataset {
  sessions: Map<string, DatasetRow[]>;
  descriptors: SessionDescriptor[];
}

function buildCompositeKey(row: DatasetRow, fields: string[]): string {
  if (fields.length === 0) return 'global';
  return fields.map((field) => String(row[field] ?? 'unknown')).join('|');
}

export class Sessionizer {
  public static sessionize(rows: DatasetRow[], schema: DatasetSchema): SessionizedDataset {
    const sessions = new Map<string, DatasetRow[]>();

    for (const row of rows) {
      const entityKey = buildCompositeKey(row, schema.entityFields);
      const sessionKey = buildCompositeKey(row, schema.sessionFields);
      const id = `${entityKey}::${sessionKey}`;
      const bucket = sessions.get(id);

      if (bucket) {
        bucket.push(row);
      } else {
        sessions.set(id, [row]);
      }
    }

    const descriptors: SessionDescriptor[] = [];

    for (const [id, sessionRows] of sessions.entries()) {
      const sortedRows = [...sessionRows].sort(
        (a, b) => Number(a[schema.timestampField] ?? 0) - Number(b[schema.timestampField] ?? 0)
      );
      sessions.set(id, sortedRows);

      const startTime = Number(sortedRows[0]?.[schema.timestampField] ?? 0);
      const endTime = Number(sortedRows[sortedRows.length - 1]?.[schema.timestampField] ?? 0);
      const [entityKey, sessionKey] = id.split('::');

      descriptors.push({
        id,
        entityKey,
        sessionKey,
        rowCount: sortedRows.length,
        startTime,
        endTime,
      });
    }

    descriptors.sort((a, b) => b.rowCount - a.rowCount);

    return { sessions, descriptors };
  }
}
