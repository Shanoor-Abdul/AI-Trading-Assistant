"use client";

import { useEffect, useState } from "react";

interface ObservationTimingProps {
  lastObservationTimestamp: number;
  frequencySeconds: number;
  active: boolean;
}

export function useObservationTiming({ lastObservationTimestamp, frequencySeconds, active }: ObservationTimingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [active]);

  const elapsed = lastObservationTimestamp > 0
    ? Math.max(0, (now - lastObservationTimestamp) / 1000)
    : 0;
  const next = lastObservationTimestamp > 0
    ? Math.max(0, frequencySeconds - elapsed)
    : frequencySeconds;

  return { elapsed, next };
}

export function ObservationTiming({ lastObservationTimestamp, frequencySeconds, active }: ObservationTimingProps) {
  const { elapsed, next } = useObservationTiming({ lastObservationTimestamp, frequencySeconds, active });

  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div className="rounded-md border p-2">
        <div className="text-muted-foreground">Last Frame</div>
        <div className="font-medium tabular-nums">{elapsed.toFixed(2)}s ago</div>
      </div>
      <div className="rounded-md border p-2">
        <div className="text-muted-foreground">Next Frame</div>
        <div className="font-medium tabular-nums">{next.toFixed(2)}s</div>
      </div>
    </div>
  );
}
