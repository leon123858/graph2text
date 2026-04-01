import { FieldRole, MetricMode, TimePoint } from '../types.js';

export class MetricSemantics {
  public static inferMetricMode(name: string, role?: FieldRole): MetricMode {
    const normalized = name.toLowerCase();

    if (role === 'counter') return 'counter';
    if (/(soc|battery|bat|charge|rul)/.test(normalized)) return 'battery';
    if (/(speed|vsp|rpm|torque|current|amp|power|temp|mot)/.test(normalized)) return 'dynamic';
    return 'generic';
  }

  public static describeMetricMode(metricMode: MetricMode): string {
    switch (metricMode) {
      case 'battery':
        return 'battery-state';
      case 'dynamic':
        return 'dynamic-signal';
      case 'counter':
        return 'counter';
      default:
        return 'generic';
    }
  }

  public static inferMetricSubtype(name: string, role?: FieldRole): string {
    const normalized = name.toLowerCase();
    if (role === 'counter') {
      if (/(odo|odometer|mileage)/.test(normalized)) return 'odometer';
      return 'counter';
    }
    if (/(soc)/.test(normalized)) return 'soc';
    if (/(bata|current|amp)/.test(normalized)) return 'current';
    if (/(batv|volt)/.test(normalized)) return 'voltage';
    if (/(vsp|speed)/.test(normalized)) return 'speed';
    if (/(motp|motor.*temp|temp|ambient|ambt)/.test(normalized)) {
      if (/(ambient|ambt)/.test(normalized)) return 'ambient_temperature';
      return 'temperature';
    }
    if (/(power)/.test(normalized)) return 'power';
    return MetricSemantics.inferMetricMode(name, role);
  }

  public static sortTelemetryPoints(data: TimePoint[]): TimePoint[] {
    return [...data].sort((left, right) => left.time - right.time);
  }
}
