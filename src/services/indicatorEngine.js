import { EMA, RSI, ATR } from 'technicalindicators';

export function computeIndicators(history) {
  const closes = history.map((candle) => candle.close);
  const highs = history.map((candle) => candle.high);
  const lows = history.map((candle) => candle.low);

  const ema20Series = EMA.calculate({ period: 20, values: closes });
  const ema50Series = EMA.calculate({ period: 50, values: closes });
  const rsiSeries = RSI.calculate({ period: 14, values: closes });
  const atrSeries = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

  return {
    ema20: ema20Series.at(-1),
    ema50: ema50Series.at(-1),
    rsi14: rsiSeries.at(-1),
    atr14: atrSeries.at(-1),
  };
}
