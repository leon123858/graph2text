import { FeatureCard } from '../types.js';

function suppressPeriodicity(card: FeatureCard): boolean {
  return card.kind === 'periodicity' && card.confidence < 0.7;
}

function suppressWeakDynamic(card: FeatureCard): boolean {
  if (card.kind !== 'dynamic') return false;
  return /0 surges and 0 braking/.test(card.summary);
}

function suppressWeakCorrelation(card: FeatureCard): boolean {
  if (card.kind !== 'correlation' && card.kind !== 'lead_lag') return false;
  return card.confidence < 0.55;
}

function suppressWeakEventCoupling(card: FeatureCard): boolean {
  if (card.kind !== 'event_coupling') return false;
  return card.confidence < 0.65;
}

function suppressWeakWindowStability(card: FeatureCard): boolean {
  if (card.kind !== 'windowed_stability') return false;
  return /0\.0% of local windows/.test(card.summary);
}

export class FeatureCardCalibrator {
  public static calibrate(cards: FeatureCard[]): FeatureCard[] {
    return cards
      .map((card) => ({
        ...card,
        confidence: Math.max(0, Math.min(1, card.confidence)),
      }))
      .filter((card) => !suppressPeriodicity(card))
      .filter((card) => !suppressWeakDynamic(card))
      .filter((card) => !suppressWeakCorrelation(card))
      .filter((card) => !suppressWeakEventCoupling(card))
      .filter((card) => !suppressWeakWindowStability(card))
      .sort((left, right) => right.confidence - left.confidence);
  }
}
