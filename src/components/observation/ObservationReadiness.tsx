"use client";

import { Badge } from "@/components/ui/badge";

interface ObservationReadinessProps {
  currentFrames: number;
  expectedFrames: number;
  minFrames?: number;
}

export function getObservationReadiness(currentFrames: number, expectedFrames: number, minFrames = 4) {
  if (currentFrames <= 0 || expectedFrames <= 0) {
    return { label: "NOT READY", confidence: "LOW", message: "Collect more chart history." };
  }

  const ratio = currentFrames / expectedFrames;
  if (ratio < 0.25 || currentFrames < minFrames) {
    return { label: "FAIR", confidence: "LOW", message: "Limited visual history." };
  }
  if (ratio < 0.6) {
    return { label: "GOOD", confidence: "MEDIUM", message: "Enough recent chart history for a preliminary analysis." };
  }
  if (ratio < 1) {
    return { label: "VERY GOOD", confidence: "HIGH", message: "Strong visual history is available." };
  }
  return { label: "READY", confidence: "HIGH", message: "A full observation window is available." };
}

export function ObservationReadiness({ currentFrames, expectedFrames, minFrames }: ObservationReadinessProps) {
  const readiness = getObservationReadiness(currentFrames, expectedFrames, minFrames);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div>
        <div className="text-xs text-muted-foreground">Analysis Readiness</div>
        <div className="text-sm font-medium">{readiness.message}</div>
      </div>
      <Badge variant={readiness.label === "READY" || readiness.label === "VERY GOOD" ? "default" : "secondary"}>
        {readiness.label} · {readiness.confidence}
      </Badge>
    </div>
  );
}
