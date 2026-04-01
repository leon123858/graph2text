import { min, max, mean } from 'simple-statistics';
import { MathUtility } from '../utils/mathUtility.js';
import { SeriesFeatureSummary, TimePoint } from '../types.js';

export class SingleSeriesAnalyzer {
  public static summarize(data: TimePoint[], name: string): SeriesFeatureSummary {
    const sortedData = [...data].sort((left, right) => left.time - right.time);
    const values = sortedData.map((d) => d.value);
    const dominantPeriods = MathUtility.detectCandidatePeriods(values, Math.floor(values.length / 3));
    const anomalies = MathUtility.zScorePeakDetection(values, Math.min(30, Math.max(5, Math.floor(values.length / 5))), 3.5, 0.1);
    const qualityIssues = MathUtility.assessSeriesQuality(sortedData);

    let positiveMoves = 0;
    let negativeMoves = 0;
    for (let i = 1; i < values.length; i++) {
      const delta = values[i] - values[i - 1];
      if (delta > 0) positiveMoves++;
      if (delta < 0) negativeMoves++;
    }

    let trend: SeriesFeatureSummary['trend'] = 'stable';
    if (positiveMoves > negativeMoves * 1.25) trend = 'rising';
    else if (negativeMoves > positiveMoves * 1.25) trend = 'falling';
    else if (positiveMoves > 0 && negativeMoves > 0) trend = 'mixed';

    const range = values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
    const avgAbs = values.length === 0 ? 0 : values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
    const relativeRange = avgAbs === 0 ? range : range / avgAbs;
    let volatility: SeriesFeatureSummary['volatility'] = 'low';
    if (relativeRange > 0.8) volatility = 'high';
    else if (relativeRange > 0.25) volatility = 'medium';

    return {
      name,
      sampleCount: sortedData.length,
      duration: sortedData.length > 1 ? sortedData[sortedData.length - 1].time - sortedData[0].time : undefined,
      dominantPeriods,
      trend,
      volatility,
      anomalies,
      qualityIssues,
    };
  }

  public static process(data: TimePoint[], name: string): string {
    const sortedData = [...data].sort((left, right) => left.time - right.time);
    const n = sortedData.length;
    const summary = SingleSeriesAnalyzer.summarize(sortedData, name);

    // Rule 1: Not enough data for advanced feature extraction
    if (n < 5) return SingleSeriesAnalyzer.generateRawDataNarrative(sortedData, name);

    const values = sortedData.map((d) => d.value);

    // Rule 2: Detect periodicity (Dominant Period)
    const periodResult = summary.dominantPeriods.length > 0
      ? { isPeriodic: true, period: summary.dominantPeriods[0] }
      : MathUtility.detectDominantPeriod(values, Math.floor(n / 3));

    let sb = `Dynamic Behavior and Trajectory Analysis Report for [${name}]:\n\n`;
    if (summary.qualityIssues.length > 0) {
      sb += `[Data Quality Gate]\n`;
      for (const issue of summary.qualityIssues) {
        sb += `- ${issue.severity.toUpperCase()}: ${issue.message}\n`;
      }
      sb += '\n';
    }

    sb += `[Series Characterization]\n`;
    sb += `- Samples: ${summary.sampleCount}`;
    if (summary.duration !== undefined) {
      sb += `, Duration: ${summary.duration} time units`;
    }
    sb += `\n- Trend Regime: ${summary.trend}\n`;
    sb += `- Volatility Regime: ${summary.volatility}\n`;
    if (summary.dominantPeriods.length > 0) {
      sb += `- Candidate Periods: ${summary.dominantPeriods.join(', ')} observation points\n\n`;
    } else {
      sb += `- Candidate Periods: none with sufficient confidence\n\n`;
    }

    if (periodResult.isPeriodic && periodResult.period! >= 4) {
      // Rule 3: Periodic
      const T = periodResult.period!;
      sb += `1. Periodicity Conclusion: A highly repetitive pattern was detected. A complete cycle consists of ${T} observation points.\n`;
      sb += `The following analysis represents the 'Golden Cycle' characteristics extracted after noise filtering and phase folding:\n\n`;

      const foldedValues = MathUtility.extractGoldenProfile(values, T);
      const foldedData: TimePoint[] = foldedValues.map((val, i) => ({
        time: (i * 100.0) / T,
        value: val,
      }));

      sb += SingleSeriesAnalyzer.generateAdvancedTrajectoryNarrative(foldedData, 'Standard Cycle Trajectory') + '\n';
      sb += SingleSeriesAnalyzer.generateWaveformDistributionNarrative(foldedValues) + '\n';
    } else {
      // Rule 4: Non-periodic
      sb += `1. Periodicity Conclusion: No distinct fixed repetitive cycles were detected. Advanced global trajectory analysis follows:\n\n`;
      sb += SingleSeriesAnalyzer.generateAdvancedTrajectoryNarrative(sortedData, name) + '\n';
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

  private static generateAdvancedTrajectoryNarrative(data: TimePoint[], name: string): string {
    const values = data.map((d) => d.value);
    const n = values.length;

    // 1. Symbolic DNA (SAX)
    const saxPattern = MathUtility.saxEncoding(values, 12, 5);

    // 2. Trajectory Phases (PLA)
    const segments = MathUtility.piecewiseLinearApproximation(values, 8);

    // 3. Landmarks (Z-Score)
    const peakLag = Math.max(2, Math.min(30, Math.floor(n / 5)));
    const peaks = MathUtility.zScorePeakDetection(values, peakLag, 3.5, 0.1);

    const vMin = min(values);
    const vMax = max(values);
    const avg = mean(values);

    let sb = `[Trajectory & Feature Analysis: ${name}]\n`;
    sb += `- Global Statistics: Range [${vMin.toFixed(1)}, ${vMax.toFixed(1)}], Average: ${avg.toFixed(1)}\n`;
    sb += `- Structural DNA: "${saxPattern}" (12-segment symbolic trend encoding)\n\n`;

    sb += `[Phased Linear Trend Approximation]\n`;
    segments.forEach((seg, i) => {
      const slope = seg.slope;
      let direction = 'Stable';
      if (slope > 0.05) direction = 'Rising';
      else if (slope < -0.05) direction = 'Falling';

      sb += `- Phase ${i + 1} (${direction}): From ${data[seg.startIndex].time} (${seg.startValue.toFixed(1)}) to ${data[seg.endIndex].time} (${seg.endValue.toFixed(1)})\n`;
    });

    if (peaks.length > 0) {
      sb += `\n[Landmark Events & Anomalies]\n`;
      // Show top 5 by significance (score)
      const topPeaks = [...peaks].sort((a, b) => b.score - a.score).slice(0, 5);
      topPeaks.forEach((p) => {
        const type = p.type === 'peak' ? 'Spike/High' : 'Dip/Low';
        sb += `- ${type} at ${data[p.index].time} (Value: ${p.value.toFixed(1)}, Significance: ${p.score.toFixed(1)}σ)\n`;
      });
    } else {
      sb += `\n- No significant localized anomalies detected via Z-score analysis.\n`;
    }

    return sb;
  }

  private static generateWaveformDistributionNarrative(foldedCycle: number[]): string {
    const T = foldedCycle.length;
    if (T < 3) return "[Waveform Morphological Distribution]\n- Insufficient data for analysis.\n";

    const mean = foldedCycle.reduce((sum, val) => sum + val, 0) / T;
    const smoothed = new Array(T);
    for (let i = 0; i < T; i++) {
      const prev = foldedCycle[(i - 1 + T) % T];
      const curr = foldedCycle[i];
      const next = foldedCycle[(i + 1) % T];
      smoothed[i] = (prev + curr + next) / 3;
    }

    let minVal = smoothed[0], maxVal = smoothed[0];
    let minIdx = 0, maxIdx = 0;

    for (let i = 1; i < T; i++) {
      if (smoothed[i] < minVal) { minVal = smoothed[i]; minIdx = i; }
      if (smoothed[i] > maxVal) { maxVal = smoothed[i]; maxIdx = i; }
    }

    const amplitude = maxVal - minVal;
    const isFlat = mean !== 0 ? (amplitude / Math.abs(mean)) < 0.05 : amplitude < 0.01;

    let sb = `[Waveform Morphological Distribution]\n`;

    if (isFlat) {
      sb += `- Shape Classification: The cycle is categorized as 'Flat/Stable' (No significant fluctuations detected).\n`;
      sb += `- Amplitude: Peak-to-peak amplitude is negligible.\n`;
      return sb;
    }

    let riseDuration = maxIdx > minIdx ? maxIdx - minIdx : T - minIdx + maxIdx;
    let fallDuration = T - riseDuration;

    let shape = 'Symmetrical Waveform (Similar ramp-up and decay times)';
    if (riseDuration > fallDuration * 1.5) shape = 'Left-skewed Waveform (Slow ramp-up, rapid decay)';
    else if (fallDuration > riseDuration * 1.5) shape = 'Right-skewed Waveform (Sudden spike, slow decay)';

    const nearPeakCount = smoothed.filter(v => v >= maxVal - (amplitude * 0.1)).length;
    const hasMultiplePeaks = nearPeakCount > (T * 0.2);

    const peakPhase = (maxIdx / T) * 100.0;

    if (hasMultiplePeaks) {
      sb += `- Shape Classification: Complex/Multi-peak Waveform (Broad peak area detected).\n`;
    } else {
      sb += `- Shape Classification: The primary cycle is categorized as '${shape}'.\n`;
    }

    sb += `- Phase Location: The primary peak occurs at approximately ${peakPhase.toFixed(0)}% of the cycle progress.\n`;
    sb += `- Energy Distribution: The primary ramp-up takes about ${((riseDuration / T) * 100).toFixed(0)}% of the cycle duration, while the decay phase accounts for ${((fallDuration / T) * 100).toFixed(0)}%.\n`;

    return sb;
  }
}
