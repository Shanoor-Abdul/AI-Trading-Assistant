"use client";

import { useEffect } from "react";

/**
 * The dashboard already posts the final analysis to /api/analyze.
 * When progressive visual analysis has produced structured text state, the
 * final request does not need another image/market-data/LLM round trip.
 * Intercept only that exact case and send the compact state to /api/fast-signal.
 */
export function FastSignalFetchInterceptor() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const marker = "__fast_signal_interceptor_installed__";

    if ((window as any)[marker]) return;
    (window as any)[marker] = true;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (!url.includes("/api/analyze") || init?.method?.toUpperCase() !== "POST" || typeof init?.body !== "string") {
        return originalFetch(input, init);
      }

      try {
        const body = JSON.parse(init.body);
        const progressiveState = Array.isArray(body.progressiveState) ? body.progressiveState : [];

        if (
          body.isProgressive === false &&
          body.marketDataMode === "visual_only" &&
          progressiveState.length > 0
        ) {
          const fastPayload = {
            symbol: body.symbol,
            timeframe: body.timeframe,
            platform: body.platform,
            tradeDuration: body.tradeDuration,
            progressive: progressiveState,
          };

          return originalFetch("/api/fast-signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fastPayload),
          });
        }
      } catch {
        // Preserve the existing analysis path if the request cannot be parsed.
      }

      return originalFetch(input, init);
    };

    return () => {
      // Keep the interceptor installed for the app lifetime; removing it on
      // route transitions can create a race with an in-flight analysis.
    };
  }, []);

  return null;
}
