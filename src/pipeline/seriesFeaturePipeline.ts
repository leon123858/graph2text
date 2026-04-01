import { mean } from 'simple-statistics';
import { FieldRole, MetricMode, RegimeSegment, TimePoint } from '../types.js';

function classifyVolatility(stdLike: number, magnitude: number): RegimeSegment['volatility'] {
  const baseline = Math.max(Math.abs(magnitude), 1e-6);
  const ratio = stdLike / baseline;
  if (ratio > 0.25) return 'high';
  if (ratio > 0.08) return 'medium';
  return 'low';
}

function classifySlope(slope: number, range: number): RegimeSegment['regime'] {
  const threshold = Math.max(range * 0.01, 0.02);
  if (slope > threshold) return 'rising';
  if (slope < -threshold) return 'falling';
  return 'stable';
}

export class SeriesFeaturePipeline {
  public static extractRegimes(data: TimePoint[], maxSegments: number = 6): RegimeSegment[] {
    if (data.length < 2) return [];

    const values = data.map((point) => point.value);
    const globalRange = Math.max(...values) - Math.min(...values);
    const blockSize = Math.max(3, Math.floor(data.length / maxSegments));
    const regimes: RegimeSegment[] = [];

    for (let startIndex = 0; startIndex < data.length - 1; startIndex += blockSize) {
      const endIndex = Math.min(data.length - 1, startIndex + blockSize - 1);
      const block = data.slice(startIndex, endIndex + 1);
      if (block.length < 2) continue;

      const blockValues = block.map((point) => point.value);
      const start = block[0];
      const end = block[block.length - 1];
      const meanValue = mean(blockValues);
      const varianceLike =
        blockValues.reduce((sum, value) => sum + Math.pow(value - meanValue, 2), 0) / blockValues.length;
      const slope = (end.value - start.value) / Math.max(end.time - start.time, 1);

      regimes.push({
        startIndex,
        endIndex,
        startTime: start.time,
        endTime: end.time,
        startValue: start.value,
        endValue: end.value,
        meanValue,
        slope,
        volatility: classifyVolatility(Math.sqrt(varianceLike), Math.abs(meanValue)),
        regime: classifySlope(slope, globalRange),
      });
    }

    return SeriesFeaturePipeline.mergeAdjacentRegimes(regimes);
  }

  private static mergeAdjacentRegimes(regimes: RegimeSegment[]): RegimeSegment[] {
    if (regimes.length <= 1) return regimes;

    const merged: RegimeSegment[] = [regimes[0]];
    for (let i = 1; i < regimes.length; i++) {
      const current = regimes[i];
      const previous = merged[merged.length - 1];
      if (previous.regime === current.regime && previous.volatility === current.volatility) {
        previous.endIndex = current.endIndex;
        previous.endTime = current.endTime;
        previous.endValue = current.endValue;
        previous.meanValue = (previous.meanValue + current.meanValue) / 2;
        previous.slope = (previous.slope + current.slope) / 2;
      } else {
        merged.push(current);
      }
    }
    return merged;
  }

  public static extractCounterFeatures(data: TimePoint[]): { totalIncrease: number; resets: number; plateauRatio: number } {
    if (data.length < 2) {
      return { totalIncrease: 0, resets: 0, plateauRatio: 0 };
    }

    let totalIncrease = 0;
    let resets = 0;
    let plateauSteps = 0;

    for (let i = 1; i < data.length; i++) {
      const delta = data[i].value - data[i - 1].value;
      if (delta > 0) totalIncrease += delta;
      else if (delta < 0) resets++;
      else plateauSteps++;
    }

    return {
      totalIncrease,
      resets,
      plateauRatio: plateauSteps / Math.max(data.length - 1, 1),
    };
  }

  public static extractDynamicFeatures(data: TimePoint[]): {
    stopRatio: number;
    cruiseRatio: number;
    surgeCount: number;
    brakingCount: number;
    peakValue: number;
  } {
    if (data.length === 0) {
      return { stopRatio: 0, cruiseRatio: 0, surgeCount: 0, brakingCount: 0, peakValue: 0 };
    }

    const values = data.map((point) => point.value);
    const peakValue = Math.max(...values);
    const maxMagnitude = Math.max(peakValue, Math.abs(Math.min(...values)), 1e-6);
    const stopThreshold = maxMagnitude * 0.05;
    const cruiseThreshold = maxMagnitude * 0.4;
    let stopCount = 0;
    let cruiseCount = 0;
    let surgeCount = 0;
    let brakingCount = 0;

    for (let i = 0; i < data.length; i++) {
      const current = data[i].value;
      if (Math.abs(current) <= stopThreshold) stopCount++;
      if (Math.abs(current) >= cruiseThreshold) cruiseCount++;

      if (i > 0) {
        const delta = data[i].value - data[i - 1].value;
        if (delta > maxMagnitude * 0.15) surgeCount++;
        if (delta < -maxMagnitude * 0.15) brakingCount++;
      }
    }

    return {
      stopRatio: stopCount / data.length,
      cruiseRatio: cruiseCount / data.length,
      surgeCount,
      brakingCount,
      peakValue,
    };
  }

  public static extractBatteryFeatures(data: TimePoint[]): {
    netChange: number;
    dischargeSteps: number;
    rechargeSteps: number;
    recoveryEvents: number;
    lowBandRatio: number;
  } {
    if (data.length < 2) {
      return { netChange: 0, dischargeSteps: 0, rechargeSteps: 0, recoveryEvents: 0, lowBandRatio: 0 };
    }

    const values = data.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const lowThreshold = minValue + (maxValue - minValue) * 0.2;

    let dischargeSteps = 0;
    let rechargeSteps = 0;
    let recoveryEvents = 0;
    let lowBandCount = 0;

    for (let i = 0; i < data.length; i++) {
      if (data[i].value <= lowThreshold) lowBandCount++;
      if (i === 0) continue;
      const delta = data[i].value - data[i - 1].value;
      if (delta < 0) dischargeSteps++;
      if (delta > 0) {
        rechargeSteps++;
        if (delta > Math.max(maxValue - minValue, 1) * 0.05) recoveryEvents++;
      }
    }

    return {
      netChange: data[data.length - 1].value - data[0].value,
      dischargeSteps,
      rechargeSteps,
      recoveryEvents,
      lowBandRatio: lowBandCount / data.length,
    };
  }

  public static chooseAnalysisMode(role?: FieldRole): 'continuous' | 'counter' {
    return role === 'counter' ? 'counter' : 'continuous';
  }

  public static chooseMetricMode(name: string, role?: FieldRole): MetricMode {
    const normalized = name.toLowerCase();
    if (role === 'counter') return 'counter';
    if (/(soc|battery|bat|charge|rul)/.test(normalized)) return 'battery';
    if (/(speed|vsp|rpm|torque|current|amp|power|temp|mot)/.test(normalized)) return 'dynamic';
    return 'generic';
  }
}
