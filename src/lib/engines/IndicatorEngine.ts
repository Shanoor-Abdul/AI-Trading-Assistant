import { EMA, RSI, MACD, ADX, OBV, SMA } from 'technicalindicators';
import { OHLCV } from '../providers/market/MarketProvider';

export class IndicatorEngine {
  
  static calculate(ohlcv: OHLCV[]) {
    if (!ohlcv || ohlcv.length < 50) return null;

    const closePrices = ohlcv.map(c => c.close);
    const highPrices = ohlcv.map(c => c.high);
    const lowPrices = ohlcv.map(c => c.low);
    const volumes = ohlcv.map(c => c.volume);

    // EMA 20 & 50
    const ema20 = EMA.calculate({ period: 20, values: closePrices });
    const ema50 = EMA.calculate({ period: 50, values: closePrices });

    // RSI 14
    const rsi14 = RSI.calculate({ period: 14, values: closePrices });

    // MACD
    const macd = MACD.calculate({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
      values: closePrices
    });

    // ADX 14
    const adx = ADX.calculate({
      period: 14,
      high: highPrices,
      low: lowPrices,
      close: closePrices
    });

    // OBV (On Balance Volume)
    const obv = OBV.calculate({
      close: closePrices,
      volume: volumes
    });

    // Volume SMA 20
    const volumeSma = SMA.calculate({ period: 20, values: volumes });

    // Get latest values
    const latest = {
      ema20: ema20.length > 0 ? ema20[ema20.length - 1] : null,
      ema50: ema50.length > 0 ? ema50[ema50.length - 1] : null,
      rsi: rsi14.length > 0 ? rsi14[rsi14.length - 1] : null,
      macd: macd.length > 0 ? macd[macd.length - 1] : null,
      adx: adx.length > 0 ? adx[adx.length - 1] : null,
      obv: obv.length > 0 ? obv[obv.length - 1] : null,
      volumeSma: volumeSma.length > 0 ? volumeSma[volumeSma.length - 1] : null,
    };

    return {
      latest,
      series: {
        ema20,
        ema50,
        rsi14,
        macd,
        adx,
        obv,
        volumeSma
      }
    };
  }
}
