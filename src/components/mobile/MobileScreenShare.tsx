"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MonitorUp, Square, Timer, CircleAlert } from "lucide-react";
import { useMobileScreenShare } from "@/hooks/useMobileScreenShare";

export type MobileScreenShareProps = {
  onObservation?: (observation: { timestamp: number; imageBase64: string }) => void;
  frequencySeconds?: number;
};

export function MobileScreenShare({ onObservation, frequencySeconds = 15 }: MobileScreenShareProps) {
  const {
    videoRef,
    canvasRef,
    observations,
    isSharing,
    isSupported,
    error,
    secondsUntilNextFrame,
    startSharing,
    stopSharing,
    clearObservations,
    maxObservations,
  } = useMobileScreenShare(onObservation, frequencySeconds);

  const progress = Math.min(100, ((frequencySeconds - secondsUntilNextFrame) / frequencySeconds) * 100);

  return (
    <Card className="border-zinc-800 bg-zinc-950/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Live Screen Observation</p>
            <p className="text-[11px] text-zinc-500">Capture the trading screen without automatic AI calls.</p>
          </div>
          <span className={`text-[10px] font-semibold ${isSharing ? "text-green-400" : "text-zinc-500"}`}>
            {isSharing ? "● ACTIVE" : "○ OFF"}
          </span>
        </div>

        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        {!isSupported && (
          <div className="flex gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-300">
            <CircleAlert className="h-4 w-4 shrink-0" />
            <span>Screen sharing is not available in this browser. Mobile screenshot upload remains available.</span>
          </div>
        )}

        {error && <p className="text-xs text-orange-300">{error}</p>}

        {isSharing && (
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-zinc-400"><Timer className="h-3 w-3" /> Next frame</span>
              <span className="font-mono text-zinc-200">{Math.ceil(secondsUntilNextFrame)}s</span>
            </div>
            <Progress value={progress} className="h-1 bg-zinc-800" />
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Frames: {observations.length} / {maxObservations}</span>
              <span>15s capture</span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!isSharing ? (
            <Button className="flex-1" onClick={() => void startSharing()} disabled={!isSupported}>
              <MonitorUp className="mr-2 h-4 w-4" /> Start Screen Share
            </Button>
          ) : (
            <Button variant="destructive" className="flex-1" onClick={stopSharing}>
              <Square className="mr-2 h-4 w-4" /> Stop Screen Share
            </Button>
          )}
          <Button variant="outline" onClick={clearObservations} disabled={observations.length === 0}>
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
