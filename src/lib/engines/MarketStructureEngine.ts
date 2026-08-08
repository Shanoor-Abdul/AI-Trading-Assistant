import { OHLCV } from '../providers/market/MarketProvider';

export class MarketStructureEngine {

  /**
   * Identifies Swing Highs and Swing Lows
   * A swing high is a candle with a high higher than the N candles before and after it.
   */
  static findSwings(ohlcv: OHLCV[], leftBars = 5, rightBars = 5) {
    const swingHighs = [];
    const swingLows = [];

    for (let i = leftBars; i < ohlcv.length - rightBars; i++) {
      let isHigh = true;
      let isLow = true;
      const currentHigh = ohlcv[i].high;
      const currentLow = ohlcv[i].low;

      // Check left
      for (let j = i - leftBars; j < i; j++) {
        if (ohlcv[j].high >= currentHigh) isHigh = false;
        if (ohlcv[j].low <= currentLow) isLow = false;
      }

      // Check right
      for (let j = i + 1; j <= i + rightBars; j++) {
        if (ohlcv[j].high >= currentHigh) isHigh = false;
        if (ohlcv[j].low <= currentLow) isLow = false;
      }

      if (isHigh) {
        swingHighs.push({ index: i, price: currentHigh, time: ohlcv[i].openTime });
      }
      if (isLow) {
        swingLows.push({ index: i, price: currentLow, time: ohlcv[i].openTime });
      }
    }

    return { swingHighs, swingLows };
  }

  /**
   * Groups close swing points into Support & Resistance zones
   */
  static findSupportResistance(swings: { price: number }[], thresholdPercent = 0.5) {
    if (swings.length === 0) return [];

    // Sort by price
    const sorted = [...swings].sort((a, b) => a.price - b.price);
    const zones = [];
    
    let currentZone = { min: sorted[0].price, max: sorted[0].price, count: 1 };

    for (let i = 1; i < sorted.length; i++) {
      const price = sorted[i].price;
      const percentDiff = ((price - currentZone.max) / currentZone.max) * 100;
      
      if (percentDiff <= thresholdPercent) {
        currentZone.max = price;
        currentZone.count++;
      } else {
        if (currentZone.count > 1) {
          zones.push(currentZone);
        }
        currentZone = { min: price, max: price, count: 1 };
      }
    }
    
    if (currentZone.count > 1) {
      zones.push(currentZone);
    }

    return zones;
  }

  /**
   * Determines the objective market regime (Trending up, down, or ranging) based on ADX and Swings
   */
  static determineRegime(ohlcv: OHLCV[], adxData: any) {
    if (!adxData || adxData.adx < 20) {
      return "RANGING";
    }

    // Very basic trend detection: if close > EMA50 and ADX > 25, Uptrend
    // We can expand this using the swing highs and lows (Higher Highs, Higher Lows)
    const { swingHighs, swingLows } = this.findSwings(ohlcv, 3, 3);
    
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const lastHigh = swingHighs[swingHighs.length - 1].price;
      const prevHigh = swingHighs[swingHighs.length - 2].price;
      const lastLow = swingLows[swingLows.length - 1].price;
      const prevLow = swingLows[swingLows.length - 2].price;

      if (lastHigh > prevHigh && lastLow > prevLow) {
        return "UPTREND";
      } else if (lastHigh < prevHigh && lastLow < prevLow) {
        return "DOWNTREND";
      }
    }
    
    return "CHOPPING";
  }
}
