import { gunzipSync } from "node:zlib";

/**
 * Compressed reference derived from the supplied 98-pattern candlestick dataset.
 * This is reference knowledge only: tested rate/score are NOT probabilities.
 */
const COMPRESSED_REFERENCE = "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";

export type CandlestickReference = {
  name: string;
  n: number;
  bias: string;
  klass: string;
  logic: string;
  behavior: string;
  rate: number;
  rank: number | null;
  freq: number | null;
  score: number;
  agrees: boolean;
};

let cache: CandlestickReference[] | null = null;

function loadReference(): CandlestickReference[] {
  if (cache) return cache;
  const json = gunzipSync(Buffer.from(COMPRESSED_REFERENCE, "base64")).toString("utf8");
  cache = JSON.parse(json) as CandlestickReference[];
  return cache;
}

export function buildCandlestickReference(): string {
  const rows = loadReference();
  return rows
    .map((p) => {
      const rank = p.rank == null ? "NA" : String(p.rank);
      const freq = p.freq == null ? "NA" : String(p.freq);
      return `${p.name} | candles=${p.n} | bias=${p.bias} | class=${p.klass} | tested=${p.behavior} | rate=${p.rate}% | perfRank=${rank}/103 | freqRank=${freq}/103 | score=${p.score}/100 | theoryAgrees=${p.agrees ? "yes" : "no"} | logic=${p.logic}`;
    })
    .join("\n");
}

export function buildCandlestickReferenceInstruction(): string {
  return `

==================================================
CANDLESTICK PATTERN KNOWLEDGE BASE — 98 PATTERNS
==================================================
Use the following supplied candlestick reference as a strict knowledge source.

Rules:
- Match patterns from actual candle geometry and visible/OHLC evidence; never invent a pattern because it is common.
- The "bias" and "class" fields are the TRADITIONAL interpretation.
- The "tested" and "rate" fields are EMPIRICAL reference behavior from the supplied dataset; they are not probabilities for this individual trade.
- "score" is a normalized reliability reference, NOT a win probability.
- If theoryAgrees=no, explicitly treat the traditional label and tested behavior as conflicting evidence rather than silently choosing one.
- Rare patterns must not be promoted simply because their historical rate is high; frequency/rank and current context matter.
- A candlestick pattern alone is never sufficient for a BUY/SELL decision. Require confluence with trend/market structure, momentum, support/resistance, volume when available, timeframe and trade duration.
- If the chart does not provide enough candle history to verify a pattern, do not claim exact recognition; use an uncertainty/confirmation state.
- Never expose hidden chain-of-thought. Return only the required response JSON.

REFERENCE DATA:
${buildCandlestickReference()}
`;
}
