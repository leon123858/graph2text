import { min, max, mean } from 'simple-statistics';
import { MathUtility } from '../utils/mathUtility.js';
import { TimePoint } from '../types.js';

export class SingleSeriesAnalyzer {
  public static process(data: TimePoint[], name: string): string {
    const n = data.length;

    // Rule 1: Not enough data for advanced feature extraction
    if (n < 5) return SingleSeriesAnalyzer.generateRawDataNarrative(data, name);

    const values = data.map((d) => d.value);

    // Rule 2: Detect periodicity (Dominant Period)
    const maxLag = Math.floor(n / 3);
    const periodResult = MathUtility.detectDominantPeriod(values, maxLag);

    let sb = `Dynamic Behavior and Trajectory Analysis Report for [${name}]:\n\n`;

    if (periodResult.isPeriodic && periodResult.period! >= 4) {
      // Rule 3: Periodic
      const T = periodResult.period!;
      sb += `1. Periodicity Conclusion: A highly repetitive pattern was detected. A complete cycle consists of ${T} observation points.\n`;
      sb += `The following analysis represents the 'Golden Cycle' characteristics extracted after noise filtering and phase folding:\n\n`;

      const foldedValues = MathUtility.extractGoldenProfile(values, T);
      const foldedData: TimePoint[] = foldedValues.map((val, i) => ({
        time: `Phase ${((i * 100.0) / T).toFixed(0)}%`,
        value: val,
      }));

      sb += SingleSeriesAnalyzer.generateTrajectoryNarrative(foldedData, 'Standard Cycle Trajectory') + '\n';
      sb += SingleSeriesAnalyzer.generateWaveformDistributionNarrative(foldedValues) + '\n';
    } else {
      // Rule 4: Non-periodic
      sb += `1. Periodicity Conclusion: No distinct fixed repetitive cycles were detected. Global trajectory analysis follows:\n\n`;
      sb += SingleSeriesAnalyzer.generateTrajectoryNarrative(data, name) + '\n';
    }

    return sb;
  }

  private static generateRawDataNarrative(data: TimePoint[], name: string): string {
    let sb = `Limited observation data for [${name}] (${data.length} records). Advanced trajectory and periodicity computations are skipped. Raw records below:\n`;
    for (const point of data) {
      sb += ` - Time [${point.time}] : Value ${point.value.toFixed(1)}\n`;
    }
    sb += 'Please interpret directly based on the raw data above.\n';
    return sb;
  }

  private static generateTrajectoryNarrative(data: TimePoint[], name: string): string {
    const n = data.length;
    const values = data.map((d) => d.value);

    const vMin = min(values);
    const vMax = max(values);
    const avg = mean(values);

    const p0 = 0,
      p25 = Math.floor(n / 4),
      p50 = Math.floor(n / 2),
      p75 = Math.floor((n * 3) / 4),
      p100 = n - 1;

    let sb = `[Trajectory Skeleton]\n`;
    sb += `Initial (${data[p0].time}): ${values[p0].toFixed(1)} -> Early (${data[p25].time}): ${values[p25].toFixed(1)} -> Mid (${data[p50].time}): ${values[p50].toFixed(1)} -> Late (${data[p75].time}): ${values[p75].toFixed(1)} -> Final (${data[p100].time}): ${values[p100].toFixed(1)}\n\n`;

    const windowSize = Math.max(3, Math.floor(n / 20));
    const smoothed = MathUtility.smoothDataCentered(values, windowSize);
    const turningPoints = MathUtility.findMajorTurningPoints(smoothed, vMin, vMax);

    sb += `[Major Chronological Phases]\n`;
    if (turningPoints.length === 0) {
      sb += `The series exhibits stable unidirectional development or random fluctuations without extreme dramatic shifts. Overall values range from ${vMin.toFixed(1)} to ${vMax.toFixed(1)} (Average: ${avg.toFixed(1)}).\n`;
    } else {
      let prevIdx = 0;
      for (let i = 0; i < turningPoints.length; i++) {
        const currIdx = turningPoints[i].index;
        const phase = values[currIdx] > values[prevIdx] ? 'Climb' : 'Decline';
        sb += `- Phase ${i + 1} (${phase}): From ${data[prevIdx].time}(${values[prevIdx].toFixed(1)}) to turning point ${data[currIdx].time}(${values[currIdx].toFixed(1)}).\n`;
        prevIdx = currIdx;
      }
      const finalPhase = values[n - 1] > values[prevIdx] ? 'Climb' : 'Decline';
      sb += `- Phase ${turningPoints.length + 1} (${finalPhase}): Evolved to the end at ${data[n - 1].time}(${values[n - 1].toFixed(1)}).\n`;
    }

    const diffStdDev = MathUtility.calculateDifferencesStdDev(values);
    const suddenChanges: string[] = [];
    for (let i = 1; i < n; i++) {
      const diff = values[i] - values[i - 1];
      if (Math.abs(diff) > diffStdDev * 3.5 && Math.abs(diff) > (vMax - vMin) * 0.15) {
        const action = diff > 0 ? 'Sudden Spike' : 'Sudden Crash';
        suddenChanges.push(`Experienced a [${action}] at ${data[i].time} (Amplitude drop/rise of ${Math.abs(diff).toFixed(1)})`);
      }
    }

    if (suddenChanges.length > 0) {
      sb += `\n[Sudden Volatility Warning]\n`;
      const topChanges = suddenChanges.slice(0, 3);
      for (const change of topChanges) sb += `- ${change}\n`;
    }

    return sb;
  }

  private static generateWaveformDistributionNarrative(foldedCycle: number[]): string {
    const T = foldedCycle.length;
    let minVal = foldedCycle[0], maxVal = foldedCycle[0];
    let minIdx = 0, maxIdx = 0;

    for (let i = 1; i < T; i++) {
      if (foldedCycle[i] < minVal) { minVal = foldedCycle[i]; minIdx = i; }
      if (foldedCycle[i] > maxVal) { maxVal = foldedCycle[i]; maxIdx = i; }
    }

    const riseDuration = maxIdx > minIdx ? maxIdx - minIdx : T - minIdx + maxIdx;
    const fallDuration = T - riseDuration;

    let shape = 'Symmetrical Waveform (Similar ramp-up and decay times)';
    if (riseDuration > fallDuration * 1.5) shape = 'Left-skewed Waveform (Slow ramp-up, rapid decay)';
    else if (fallDuration > riseDuration * 1.5) shape = 'Right-skewed Waveform (Sudden spike, slow decay)';

    const peakPhase = (maxIdx / T) * 100.0;

    let sb = `[Waveform Morphological Distribution]\n`;
    sb += `- Shape Classification: The cycle is categorized as '${shape}'.\n`;
    sb += `- Phase Location: The main peak consistently occurs at approximately ${peakPhase.toFixed(0)}% of the cycle progress.\n`;
    sb += `- Energy Accumulation: The ramp-up from valley to peak takes about ${((riseDuration / T) * 100).toFixed(0)}% of the cycle duration, while the decay phase accounts for ${((fallDuration / T) * 100).toFixed(0)}%.\n`;

    return sb;
  }
}
