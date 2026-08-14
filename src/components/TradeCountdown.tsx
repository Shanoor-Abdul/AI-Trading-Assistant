"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { formatTradeCountdown, parseTradeDurationMs } from "@/lib/tradeDuration";

interface TradeCountdownProps {
  startedAt: number;
  duration?: string | null;
  compact?: boolean;
  onComplete?: () => void;
}

export function TradeCountdown({
  startedAt,
  duration,
  compact = false,
  onComplete,
}: TradeCountdownProps) {
  const durationMs = useMemo(() => parseTradeDurationMs(duration), [duration]);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, startedAt + durationMs - Date.now()),
  );

  useEffect(() => {
    const update = () => {
      const next = Math.max(0, startedAt + durationMs - Date.now());
      setRemaining(next);

      if (next === 0) {
        onComplete?.();
      }
    };

    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [startedAt, durationMs, onComplete]);

  const isExpired = remaining <= 0;

  return (
    <div
      className={
        compact
          ? "flex items-center gap-1.5 font-mono text-sm font-bold text-blue-400"
          : "flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2"
      }
    >
      <Clock3 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span>{isExpired ? "00:00" : formatTradeCountdown(remaining)}</span>
      {!compact && (
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {isExpired ? "time up" : "remaining"}
        </span>
      )}
    </div>
  );
}
