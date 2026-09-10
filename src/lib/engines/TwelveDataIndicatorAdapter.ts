import { EMA, RSI, MACD, BollingerBands, ATR } from "technicalindicators";
import { Candle } from "./DeterministicApiDecisionEngine";

export interface TwelveDataRawIndicatorResponse {
  meta?: Record<string, unknown>;
  values?: Array<Record<string, unknown>>;
  status?: string;
  message?: string;
}

export interface TwelveDataIndicatorsPayload {
  "5m"?: {
    ema20?: TwelveDataRawIndicatorResponse | number[];
    ema50?: TwelveDataRawIndicatorResponse | number[];
    ema200?: TwelveDataRawIndicatorResponse | number[];
    rsi14?: TwelveDataRawIndicatorResponse | number[];
    macd?: TwelveDataRawIndicatorResponse | Array<{ macd: number; macd_signal: number; macd_hist: number }>;
    bbands?: TwelveDataRawIndicatorResponse | Array<{ upper_band: number; middle_band: number; lower_band: number }>;
    atr14?: TwelveDataRawIndicatorResponse | number[];
  };
  "1h"?: {
    ema20?: TwelveDataRawIndicatorResponse | number[];
    ema50?: TwelveDataRawIndicatorResponse | number[];
    ema200?: TwelveDataRawIndicatorResponse | number[];
    rsi14?: TwelveDataRawIndicatorResponse | number[];
    macd?: TwelveDataRawIndicatorResponse | Array<{ macd: number; macd_signal: number; macd_hist: number }>;
    atr14?: TwelveDataRawIndicatorResponse | number[];
  };
  "4h"?: {
    ema50?: TwelveDataRawIndicatorResponse | number[];
    ema200?: TwelveDataRawIndicatorResponse | number[];
    atr14?: TwelveDataRawIndicatorResponse | number[];
  };
}

export interface Normalized5mIndicators {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  rsiDelta: number | null;
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
  };
  macdSlope: "Rising" | "Falling" | "Bullish Cross" | "Bearish Cross" | "Flat";
  bb: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
  } | null;
  atr: number;
}

export interface Normalized1hIndicators {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  rsiDelta: number | null;
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
  };
  atr: number;
}

export interface Normalized4hIndicators {
  ema50: number | null;
  ema200: number | null;
  atr: number;
}

export interface NormalizedIndicatorSet {
  "5m": Normalized5mIndicators;
  "1h": Normalized1hIndicators;
  "4h": Normalized4hIndicators;
  source: "twelvedata_api" | "offline_validated_fallback";
}

export class TwelveDataIndicatorAdapter {
  /**
   * Safe parser for TwelveData single-value indicator endpoints (e.g. EMA, RSI, ATR).
   * TwelveData returns newest values first in `values` array.
   * Returns array sorted chronologically [oldest ... newest].
   */
  static parseNumericSeries(raw: unknown, fieldKey: string): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((x) => (typeof x === "number" ? x : parseFloat(String(x))))
        .filter((n) => Number.isFinite(n));
    }

    const rawObj = raw as { values?: unknown[] };
    if (rawObj && Array.isArray(rawObj.values)) {
      const parsed: number[] = [];
      // TwelveData returns newest first; iterate in reverse for chronological order
      for (let i = rawObj.values.length - 1; i >= 0; i--) {
        const item = rawObj.values[i];
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const val = parseFloat(String(record[fieldKey] ?? record.value ?? record.close));
        if (Number.isFinite(val)) {
          parsed.push(val);
        }
      }
      return parsed;
    }

    return [];
  }

  /**
   * Safe parser for TwelveData MACD endpoint.
   * Values format: { datetime, macd, macd_signal, macd_hist }
   */
  static parseMacdSeries(raw: unknown): Array<{ macd: number; signal: number; histogram: number }> {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((x) => {
          const item = x as Record<string, unknown>;
          return {
            macd: typeof item.macd === "number" ? item.macd : parseFloat(String(item.macd)),
            signal: typeof item.signal === "number" ? item.signal : parseFloat(String(item.macd_signal ?? item.signal)),
            histogram: typeof item.histogram === "number" ? item.histogram : parseFloat(String(item.macd_hist ?? item.histogram)),
          };
        })
        .filter((x) => Number.isFinite(x.macd) && Number.isFinite(x.signal) && Number.isFinite(x.histogram));
    }

    const rawObj = raw as { values?: unknown[] };
    if (rawObj && Array.isArray(rawObj.values)) {
      const parsed: Array<{ macd: number; signal: number; histogram: number }> = [];
      for (let i = rawObj.values.length - 1; i >= 0; i--) {
        const item = rawObj.values[i];
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const macd = parseFloat(String(record.macd));
        const signal = parseFloat(String(record.macd_signal ?? record.signal));
        const histogram = parseFloat(String(record.macd_hist ?? record.histogram));
        if (Number.isFinite(macd) && Number.isFinite(signal) && Number.isFinite(histogram)) {
          parsed.push({ macd, signal, histogram });
        }
      }
      return parsed;
    }

    return [];
  }

  /**
   * Safe parser for TwelveData Bollinger Bands endpoint.
   * Values format: { datetime, upper_band, middle_band, lower_band }
   */
  static parseBollingerSeries(raw: unknown): Array<{ upper: number; middle: number; lower: number }> {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((x) => {
          const item = x as Record<string, unknown>;
          return {
            upper: typeof item.upper === "number" ? item.upper : parseFloat(String(item.upper_band ?? item.upper)),
            middle: typeof item.middle === "number" ? item.middle : parseFloat(String(item.middle_band ?? item.middle)),
            lower: typeof item.lower === "number" ? item.lower : parseFloat(String(item.lower_band ?? item.lower)),
          };
        })
        .filter((x) => Number.isFinite(x.upper) && Number.isFinite(x.middle) && Number.isFinite(x.lower));
    }

    const rawObj = raw as { values?: unknown[] };
    if (rawObj && Array.isArray(rawObj.values)) {
      const parsed: Array<{ upper: number; middle: number; lower: number }> = [];
      for (let i = rawObj.values.length - 1; i >= 0; i--) {
        const item = rawObj.values[i];
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const upper = parseFloat(String(record.upper_band ?? record.upper));
        const middle = parseFloat(String(record.middle_band ?? record.middle));
        const lower = parseFloat(String(record.lower_band ?? record.lower));
        if (Number.isFinite(upper) && Number.isFinite(middle) && Number.isFinite(lower)) {
          parsed.push({ upper, middle, lower });
        }
      }
      return parsed;
    }

    return [];
  }

  /**
   * Main Normalizer: Adapts TwelveData indicator responses into the normalized structure
   * consumed by DeterministicApiDecisionEngine.
   * If any timeframe's indicator response is missing from TwelveData, automatically calculates
   * it from fallbackCandles with mathematical parity so the engine always receives complete data.
   */
  static normalizeIndicators(
    twelveDataPayload: TwelveDataIndicatorsPayload | null | undefined,
    fallbackCandles?: {
      "5m"?: Candle[];
      "1h"?: Candle[];
      "4h"?: Candle[];
    }
  ): NormalizedIndicatorSet {
    // 1. Calculate complete baseline indicators from fallback candles
    const offlineSet = this.calculateOfflineIndicators(
      fallbackCandles?.["5m"] || [],
      fallbackCandles?.["1h"] || [],
      fallbackCandles?.["4h"] || []
    );

    const raw5m = twelveDataPayload?.["5m"];
    const raw1h = twelveDataPayload?.["1h"];
    const raw4h = twelveDataPayload?.["4h"];

    // Check if TwelveData provided any live indicator data
    const hasAnyLiveIndicators = Boolean(
      raw5m?.rsi14 || raw5m?.ema20 || raw5m?.macd ||
      raw1h?.rsi14 || raw1h?.ema20 || raw1h?.macd ||
      raw4h?.ema50 || raw4h?.ema200
    );

    if (!hasAnyLiveIndicators) {
      return offlineSet;
    }

    // Overlay live TwelveData values onto the complete baseline
    // 5M Overlay
    const ema20_5m_arr = this.parseNumericSeries(raw5m?.ema20, "ema");
    const ema50_5m_arr = this.parseNumericSeries(raw5m?.ema50, "ema");
    const ema200_5m_arr = this.parseNumericSeries(raw5m?.ema200, "ema");
    const rsi14_5m_arr = this.parseNumericSeries(raw5m?.rsi14, "rsi");
    const macd_5m_arr = this.parseMacdSeries(raw5m?.macd);
    const bb_5m_arr = this.parseBollingerSeries(raw5m?.bbands);
    const atr14_5m_arr = this.parseNumericSeries(raw5m?.atr14, "atr");

    const ema20_5m = ema20_5m_arr.length ? ema20_5m_arr[ema20_5m_arr.length - 1] : offlineSet["5m"].ema20;
    const ema50_5m = ema50_5m_arr.length ? ema50_5m_arr[ema50_5m_arr.length - 1] : offlineSet["5m"].ema50;
    const ema200_5m = ema200_5m_arr.length ? ema200_5m_arr[ema200_5m_arr.length - 1] : offlineSet["5m"].ema200;
    const rsi_5m = rsi14_5m_arr.length ? rsi14_5m_arr[rsi14_5m_arr.length - 1] : offlineSet["5m"].rsi;
    const rsiDelta_5m =
      rsi14_5m_arr.length >= 3
        ? rsi14_5m_arr[rsi14_5m_arr.length - 1] - rsi14_5m_arr[rsi14_5m_arr.length - 3]
        : offlineSet["5m"].rsiDelta;

    const latestMacd5m = macd_5m_arr.length ? macd_5m_arr[macd_5m_arr.length - 1] : null;
    let macdSlope_5m: Normalized5mIndicators["macdSlope"] = offlineSet["5m"].macdSlope;
    if (macd_5m_arr.length >= 3) {
      const h0 = macd_5m_arr[macd_5m_arr.length - 3].histogram;
      const h1 = macd_5m_arr[macd_5m_arr.length - 2].histogram;
      const h2 = macd_5m_arr[macd_5m_arr.length - 1].histogram;
      if (h2 > h1 && h1 > h0) macdSlope_5m = "Rising";
      else if (h2 < h1 && h1 < h0) macdSlope_5m = "Falling";
      else if (h2 > 0 && h1 < 0) macdSlope_5m = "Bullish Cross";
      else if (h2 < 0 && h1 > 0) macdSlope_5m = "Bearish Cross";
    }

    const latestBb5m = bb_5m_arr.length ? bb_5m_arr[bb_5m_arr.length - 1] : offlineSet["5m"].bb;
    const atr_5m = atr14_5m_arr.length ? atr14_5m_arr[atr14_5m_arr.length - 1] : offlineSet["5m"].atr;

    // 1H Overlay
    const ema20_1h_arr = this.parseNumericSeries(raw1h?.ema20, "ema");
    const ema50_1h_arr = this.parseNumericSeries(raw1h?.ema50, "ema");
    const ema200_1h_arr = this.parseNumericSeries(raw1h?.ema200, "ema");
    const rsi14_1h_arr = this.parseNumericSeries(raw1h?.rsi14, "rsi");
    const macd_1h_arr = this.parseMacdSeries(raw1h?.macd);
    const atr14_1h_arr = this.parseNumericSeries(raw1h?.atr14, "atr");

    const ema20_1h = ema20_1h_arr.length ? ema20_1h_arr[ema20_1h_arr.length - 1] : offlineSet["1h"].ema20;
    const ema50_1h = ema50_1h_arr.length ? ema50_1h_arr[ema50_1h_arr.length - 1] : offlineSet["1h"].ema50;
    const ema200_1h = ema200_1h_arr.length ? ema200_1h_arr[ema200_1h_arr.length - 1] : offlineSet["1h"].ema200;
    const rsi_1h = rsi14_1h_arr.length ? rsi14_1h_arr[rsi14_1h_arr.length - 1] : offlineSet["1h"].rsi;
    const rsiDelta_1h =
      rsi14_1h_arr.length >= 3
        ? rsi14_1h_arr[rsi14_1h_arr.length - 1] - rsi14_1h_arr[rsi14_1h_arr.length - 3]
        : offlineSet["1h"].rsiDelta;
    const latestMacd1h = macd_1h_arr.length ? macd_1h_arr[macd_1h_arr.length - 1] : null;
    const atr_1h = atr14_1h_arr.length ? atr14_1h_arr[atr14_1h_arr.length - 1] : offlineSet["1h"].atr;

    // 4H Overlay
    const ema50_4h_arr = this.parseNumericSeries(raw4h?.ema50, "ema");
    const ema200_4h_arr = this.parseNumericSeries(raw4h?.ema200, "ema");
    const atr14_4h_arr = this.parseNumericSeries(raw4h?.atr14, "atr");

    const ema50_4h = ema50_4h_arr.length ? ema50_4h_arr[ema50_4h_arr.length - 1] : offlineSet["4h"].ema50;
    const ema200_4h = ema200_4h_arr.length ? ema200_4h_arr[ema200_4h_arr.length - 1] : offlineSet["4h"].ema200;
    const atr_4h = atr14_4h_arr.length ? atr14_4h_arr[atr14_4h_arr.length - 1] : offlineSet["4h"].atr;

    return {
      "5m": {
        ema20: ema20_5m,
        ema50: ema50_5m,
        ema200: ema200_5m,
        rsi: rsi_5m,
        rsiDelta: rsiDelta_5m,
        macd: {
          macd: latestMacd5m ? latestMacd5m.macd : offlineSet["5m"].macd.macd,
          signal: latestMacd5m ? latestMacd5m.signal : offlineSet["5m"].macd.signal,
          histogram: latestMacd5m ? latestMacd5m.histogram : offlineSet["5m"].macd.histogram,
        },
        macdSlope: macdSlope_5m,
        bb: latestBb5m,
        atr: atr_5m,
      },
      "1h": {
        ema20: ema20_1h,
        ema50: ema50_1h,
        ema200: ema200_1h,
        rsi: rsi_1h,
        rsiDelta: rsiDelta_1h,
        macd: {
          macd: latestMacd1h ? latestMacd1h.macd : offlineSet["1h"].macd.macd,
          signal: latestMacd1h ? latestMacd1h.signal : offlineSet["1h"].macd.signal,
          histogram: latestMacd1h ? latestMacd1h.histogram : offlineSet["1h"].macd.histogram,
        },
        atr: atr_1h,
      },
      "4h": {
        ema50: ema50_4h,
        ema200: ema200_4h,
        atr: atr_4h,
      },
      source: "twelvedata_api",
    };
  }

  /**
   * Offline / Replay Indicator Calculator
   * Retained specifically for lookahead-free historical backtesting and local unit testing.
   * Parameter configurations are mathematically aligned with standard Twelve Data indicator defaults:
   * - EMA: Period 20, 50, 200 on Close prices
   * - RSI: Period 14 (Wilder's Smoothing) on Close prices
   * - MACD: Fast 12, Slow 26, Signal 9 (Exponential)
   * - Bollinger Bands: Period 20, StdDev 2.0 on Close prices
   * - ATR: Period 14 (Wilder's Smoothing) on High, Low, Close
   */
  static calculateOfflineIndicators(
    candles5m: Candle[],
    candles1h: Candle[] = [],
    candles4h: Candle[] = []
  ): NormalizedIndicatorSet {
    // 5M Indicators
    const close5m = candles5m.map((c) => c.close);
    const high5m = candles5m.map((c) => c.high);
    const low5m = candles5m.map((c) => c.low);

    const ema20_5m_calc = close5m.length >= 20 ? EMA.calculate({ period: 20, values: close5m }) : [];
    const ema50_5m_calc = close5m.length >= 20 ? EMA.calculate({ period: Math.min(50, close5m.length), values: close5m }) : [];
    const ema200_5m_calc = close5m.length >= 100 ? EMA.calculate({ period: Math.min(200, close5m.length), values: close5m }) : [];
    const rsi14_5m_calc = close5m.length >= 15 ? RSI.calculate({ period: 14, values: close5m }) : [];
    const macd_5m_calc =
      close5m.length >= 26
        ? MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false, values: close5m })
        : [];
    const bb_5m_calc = close5m.length >= 20 ? BollingerBands.calculate({ period: 20, stdDev: 2, values: close5m }) : [];
    const atr_5m_calc = close5m.length >= 15 ? ATR.calculate({ period: 14, high: high5m, low: low5m, close: close5m }) : [];

    const ema20_5m = ema20_5m_calc.length ? ema20_5m_calc[ema20_5m_calc.length - 1] : null;
    const ema50_5m = ema50_5m_calc.length ? ema50_5m_calc[ema50_5m_calc.length - 1] : null;
    const ema200_5m = ema200_5m_calc.length ? ema200_5m_calc[ema200_5m_calc.length - 1] : null;
    const rsi_5m = rsi14_5m_calc.length ? rsi14_5m_calc[rsi14_5m_calc.length - 1] : null;
    const rsiDelta_5m =
      rsi14_5m_calc.length >= 3
        ? rsi14_5m_calc[rsi14_5m_calc.length - 1] - rsi14_5m_calc[rsi14_5m_calc.length - 3]
        : null;

    const latestMacd5m = macd_5m_calc.length ? macd_5m_calc[macd_5m_calc.length - 1] : null;
    let macdSlope_5m: Normalized5mIndicators["macdSlope"] = "Flat";
    if (macd_5m_calc.length >= 3) {
      const h0 = Number(macd_5m_calc[macd_5m_calc.length - 3].histogram);
      const h1 = Number(macd_5m_calc[macd_5m_calc.length - 2].histogram);
      const h2 = Number(macd_5m_calc[macd_5m_calc.length - 1].histogram);
      if (h2 > h1 && h1 > h0) macdSlope_5m = "Rising";
      else if (h2 < h1 && h1 < h0) macdSlope_5m = "Falling";
      else if (h2 > 0 && h1 < 0) macdSlope_5m = "Bullish Cross";
      else if (h2 < 0 && h1 > 0) macdSlope_5m = "Bearish Cross";
    }

    const latestBb5m = bb_5m_calc.length ? bb_5m_calc[bb_5m_calc.length - 1] : null;
    const atr_5m = atr_5m_calc.length
      ? atr_5m_calc[atr_5m_calc.length - 1]
      : close5m.length >= 2
      ? Math.abs(high5m[high5m.length - 1] - low5m[low5m.length - 1])
      : 0;

    // 1H Indicators
    const close1h = candles1h.map((c) => c.close);
    const high1h = candles1h.map((c) => c.high);
    const low1h = candles1h.map((c) => c.low);

    const ema20_1h_calc = close1h.length >= 20 ? EMA.calculate({ period: 20, values: close1h }) : [];
    const ema50_1h_calc = close1h.length >= 20 ? EMA.calculate({ period: Math.min(50, close1h.length), values: close1h }) : [];
    const ema200_1h_calc = close1h.length >= 100 ? EMA.calculate({ period: Math.min(200, close1h.length), values: close1h }) : [];
    const rsi14_1h_calc = close1h.length >= 15 ? RSI.calculate({ period: 14, values: close1h }) : [];
    const macd_1h_calc =
      close1h.length >= 26
        ? MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false, values: close1h })
        : [];
    const atr_1h_calc = close1h.length >= 15 ? ATR.calculate({ period: 14, high: high1h, low: low1h, close: close1h }) : [];

    const ema20_1h = ema20_1h_calc.length ? ema20_1h_calc[ema20_1h_calc.length - 1] : null;
    const ema50_1h = ema50_1h_calc.length ? ema50_1h_calc[ema50_1h_calc.length - 1] : null;
    const ema200_1h = ema200_1h_calc.length ? ema200_1h_calc[ema200_1h_calc.length - 1] : null;
    const rsi_1h = rsi14_1h_calc.length ? rsi14_1h_calc[rsi14_1h_calc.length - 1] : null;
    const rsiDelta_1h =
      rsi14_1h_calc.length >= 3
        ? rsi14_1h_calc[rsi14_1h_calc.length - 1] - rsi14_1h_calc[rsi14_1h_calc.length - 3]
        : null;
    const latestMacd1h = macd_1h_calc.length ? macd_1h_calc[macd_1h_calc.length - 1] : null;
    const atr_1h = atr_1h_calc.length ? atr_1h_calc[atr_1h_calc.length - 1] : 0;

    // 4H Indicators
    const close4h = candles4h.map((c) => c.close);
    const high4h = candles4h.map((c) => c.high);
    const low4h = candles4h.map((c) => c.low);

    const ema50_4h_calc = close4h.length >= 20 ? EMA.calculate({ period: Math.min(50, close4h.length), values: close4h }) : [];
    const ema200_4h_calc = close4h.length >= 100 ? EMA.calculate({ period: Math.min(200, close4h.length), values: close4h }) : [];
    const atr_4h_calc = close4h.length >= 15 ? ATR.calculate({ period: 14, high: high4h, low: low4h, close: close4h }) : [];

    const ema50_4h = ema50_4h_calc.length ? ema50_4h_calc[ema50_4h_calc.length - 1] : null;
    const ema200_4h = ema200_4h_calc.length ? ema200_4h_calc[ema200_4h_calc.length - 1] : null;
    const atr_4h = atr_4h_calc.length ? atr_4h_calc[atr_4h_calc.length - 1] : 0;

    return {
      "5m": {
        ema20: ema20_5m,
        ema50: ema50_5m,
        ema200: ema200_5m,
        rsi: rsi_5m,
        rsiDelta: rsiDelta_5m,
        macd: {
          macd: latestMacd5m ? Number(latestMacd5m.MACD) : null,
          signal: latestMacd5m ? Number(latestMacd5m.signal) : null,
          histogram: latestMacd5m ? Number(latestMacd5m.histogram) : null,
        },
        macdSlope: macdSlope_5m,
        bb: latestBb5m ? { upper: latestBb5m.upper, middle: latestBb5m.middle, lower: latestBb5m.lower } : null,
        atr: atr_5m,
      },
      "1h": {
        ema20: ema20_1h,
        ema50: ema50_1h,
        ema200: ema200_1h,
        rsi: rsi_1h,
        rsiDelta: rsiDelta_1h,
        macd: {
          macd: latestMacd1h ? Number(latestMacd1h.MACD) : null,
          signal: latestMacd1h ? Number(latestMacd1h.signal) : null,
          histogram: latestMacd1h ? Number(latestMacd1h.histogram) : null,
        },
        atr: atr_1h,
      },
      "4h": {
        ema50: ema50_4h,
        ema200: ema200_4h,
        atr: atr_4h,
      },
      source: "offline_validated_fallback",
    };
  }
}
