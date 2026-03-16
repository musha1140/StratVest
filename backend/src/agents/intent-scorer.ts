import type { IntentScoreArtifact, MarkerArtifact, RiskLevel } from '../types.js';

const severityWeight = {
  low: 4,
  medium: 9,
  high: 18,
  critical: 30,
} as const;

function toRisk(score: number): RiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

export function runIntentScorer(markers: MarkerArtifact): IntentScoreArtifact {
  const raw = markers.markers.reduce((sum, marker) => {
    const base = severityWeight[marker.severity];
    return sum + base * marker.confidence;
  }, 0);

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const risk = toRisk(score);

  const supplyChainCount = markers.markers.filter((marker) => marker.category === 'supply-chain').length;
  const trackingCount = markers.markers.filter((marker) => marker.category === 'tracking').length;
  const executionCount = markers.markers.filter((marker) => marker.category === 'execution-chain').length;

  const summary: string[] = [
    `${markers.markers.length} markers were detected across the run.`,
    `${supplyChainCount} markers relate to asset provenance or supply chain behavior.`,
    `${trackingCount} markers relate to telemetry or profiling surface.`,
    `${executionCount} markers relate to remote execution chains and control flow.`,
  ].filter((line) => !line.startsWith('0 '));

  if (markers.markers.length === 0) {
    summary.push('No obvious intent markers were detected in the current rule set.');
  }

  return {
    score,
    risk,
    summary,
  };
}
