import { config } from '../config/env.js';
import { fetchDailyHistory } from './marketData.js';
import { computeIndicators } from './indicatorEngine.js';

const MIN_CANDLES_REQUIRED = 100;
const ATR_STOP_MULTIPLIER = 1.5;
const RISK_REWARD_RATIO = 2; // TP = Entry + RISK_REWARD_RATIO x risk (risk = Entry - SL)

export async function analyzeTicker(ticker) {
  const history = await fetchDailyHistory(ticker);

  if (history.length < MIN_CANDLES_REQUIRED) {
    return null;
  }

  // Filter likuiditas dijalankan dulu, sebelum menghitung indikator.
  const lastCandle = history.at(-1);
  const lastClose = lastCandle.close;
  const lastVolume = lastCandle.volume;
  const transactionValue = lastClose * lastVolume;

  const passesLiquidity =
    lastClose > config.minPrice && transactionValue > config.minTransactionValue;

  if (!passesLiquidity) {
    return null;
  }

  const { ema20, ema50, rsi14, atr14 } = computeIndicators(history);

  if (ema20 == null || ema50 == null || rsi14 == null || atr14 == null) {
    return null;
  }

  const isUptrend = lastClose > ema20 && ema20 > ema50;
  const isPullbackZone = rsi14 >= 35 && rsi14 <= 48;

  if (!isUptrend || !isPullbackZone) {
    return null;
  }

  const entry = lastClose;
  const risk = ATR_STOP_MULTIPLIER * atr14;
  const stopLoss = entry - risk;
  const takeProfit = entry + RISK_REWARD_RATIO * risk;

  return {
    ticker,
    date: lastCandle.date,
    lastClose,
    transactionValue,
    ema20,
    ema50,
    rsi14,
    atr14,
    entry,
    stopLoss,
    takeProfit,
  };
}
