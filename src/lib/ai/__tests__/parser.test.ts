import { describe, it, expect } from 'vitest';
import { parseAIResponse } from '../parser';

describe('AI Parser', () => {
  it('parses a valid JSON response', () => {
    const text = `
      Some rambling before JSON...
      {
        "trend": "Bullish",
        "signal": "BUY",
        "confidence": 95,
        "entryPrice": 65000,
        "stopLoss": 64000,
        "takeProfit": 68000,
        "recommendedTimeframe": "1h",
        "explanation": "Looks good."
      }
      Some rambling after JSON...
    `;

    const result = parseAIResponse(text);
    expect(result.trend).toBe("Bullish");
    expect(result.signal).toBe("BUY");
    expect(result.confidence).toBe(95);
    // riskReward is computed by RiskEngine, not Parser.
  });

  it('returns NO_TRADE for invalid schema', () => {
    const text = `
      {
        "trend": "Up", // Invalid enum, should be Bullish
        "signal": "LONG", // Invalid enum, should be BUY
        "confidence": 95
      }
    `;

    const result = parseAIResponse(text);
    expect(result.signal).toBe("NO_TRADE");
    expect(result.explanation).toContain("AI_ANALYSIS_INVALID");
  });

  it('returns NO_TRADE when no JSON is present', () => {
    const text = "I think it is going up.";
    const result = parseAIResponse(text);
    expect(result.signal).toBe("NO_TRADE");
    expect(result.explanation).toContain("No JSON payload found");
  });
});
