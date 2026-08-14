"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, CheckCircle2, Clock3, Layers3 } from "lucide-react";

interface ObservationStatusProps {
  active: boolean;
  currentFrames: number;
  expectedFrames: number;
  currentBatchFrames: number;
  batchSize: number;
  completedAnalyses: number;
  lastFrameAgo: number;
  nextFrameIn: number;
  readiness: string;
  estimatedConfidence: string;
}

function seconds(value: number) {
  return `${Math.max(0, value).toFixed(2)}s`;
}

export function ObservationStatus({
  active,
  currentFrames,
  expectedFrames,
  currentBatchFrames,
  batchSize,
  completedAnalyses,
  lastFrameAgo,
  nextFrameIn,
  readiness,
  estimatedConfidence,
}: ObservationStatusProps) {
  const progress = expectedFrames > 0
    ? Math.min(100, (currentFrames / expectedFrames) * 100)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Activity className="size-4" />
            Live Observation
          </span>
          <span className={active ? "text-emerald-500" : "text-muted-foreground"}>
            {active ? "ACTIVE" : "IDLE"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={<Layers3 className="size-3.5" />} label="Current Frames" value={`${currentFrames} / ${expectedFrames}`} />
          <Metric icon={<Layers3 className="size-3.5" />} label="Current Batch" value={`${currentBatchFrames} / ${batchSize}`} />
          <Metric icon={<CheckCircle2 className="size-3.5" />} label="AI Analyses" value={String(completedAnalyses)} />
          <Metric icon={<Clock3 className="size-3.5" />} label="Next Frame" value={seconds(nextFrameIn)} />
        </div>

        <Progress value={progress} />

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Last Frame</div>
            <div className="font-medium">{seconds(lastFrameAgo)} ago</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Readiness</div>
            <div className="font-medium">{readiness}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Estimated Confidence</div>
            <div className="font-medium">{estimatedConfidence}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Observation Progress</div>
            <div className="font-medium">{Math.round(progress)}%</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 font-medium tabular-nums">{value}</div>
    </div>
  );
}
