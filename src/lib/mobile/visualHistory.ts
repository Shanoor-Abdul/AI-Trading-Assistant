export const MOBILE_VISUAL_HISTORY_LIMIT = 5;

export interface MobileVisualObservation {
  timestamp: number;
  base64: string;
  timeframe: string;
}

export function appendMobileObservation(
  history: MobileVisualObservation[],
  observation: MobileVisualObservation,
  limit = MOBILE_VISUAL_HISTORY_LIMIT,
): MobileVisualObservation[] {
  return [...history, observation].slice(-Math.max(1, limit));
}

export function selectMobileAnalysisFrames(
  history: MobileVisualObservation[],
): MobileVisualObservation[] {
  return history.slice(-MOBILE_VISUAL_HISTORY_LIMIT);
}
