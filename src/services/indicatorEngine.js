import { EMA, RSI, ATR, OBV } from 'technicalindicators';

export function computeIndicatorSeries(history) {
  const closes = history.map((candle) => candle.close);
  const highs = history.map((candle) => candle.high);
  const lows = history.map((candle) => candle.low);
  const volumes = history.map((candle) => candle.volume);

  return {
    ema20: EMA.calculate({ period: 20, values: closes }),
    ema50: EMA.calculate({ period: 50, values: closes }),
    rsi14: RSI.calculate({ period: 14, values: closes }),
    atr14: ATR.calculate({ period: 14, high: highs, low: lows, close: closes }),
    obv: OBV.calculate({ close: closes, volume: volumes }),
  };
}
