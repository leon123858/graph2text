import {
  DataQualityIssue,
  DatasetProfile,
  DatasetRow,
  DatasetSchema,
  FieldProfile,
} from '../types.js';
import { FieldClassifier } from './fieldClassifier.js';
import { Sessionizer } from './sessionizer.js';

function detectSchema(fieldProfiles: FieldProfile[]): DatasetSchema {
  const timestampField =
    fieldProfiles.find((profile) => profile.role === 'timestamp')?.name ??
    fieldProfiles[0]?.name ??
    'time';
  const entityFields = fieldProfiles.filter((profile) => profile.role === 'entity_key').map((profile) => profile.name);
  const sessionFields = fieldProfiles.filter((profile) => profile.role === 'session_key').map((profile) => profile.name);

  return {
    timestampField,
    entityFields,
    sessionFields,
  };
}

function buildQualityIssues(rows: DatasetRow[], schema: DatasetSchema): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (rows.length === 0) {
    issues.push({
      code: 'empty_series',
      severity: 'error',
      message: 'The dataset is empty.',
    });
    return issues;
  }

  if (schema.entityFields.length > 0 || schema.sessionFields.length > 0) {
    issues.push({
      code: 'mixed_sessions',
      severity: 'info',
      message: 'The dataset contains explicit entity/session keys and should be analyzed per session.',
    });
  }

  return issues;
}

export class DatasetProfiler {
  public static profile(rows: DatasetRow[]): DatasetProfile {
    const fieldProfiles = FieldClassifier.profileFields(rows);
    const schema = detectSchema(fieldProfiles);
    const sessionized = Sessionizer.sessionize(rows, schema);

    return {
      schema,
      fieldProfiles,
      sessions: sessionized.descriptors,
      qualityIssues: buildQualityIssues(rows, schema),
    };
  }
}
