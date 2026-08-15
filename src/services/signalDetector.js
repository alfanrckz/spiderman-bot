import { config } from '../config/env.js';
import { fetchDailyHistory } from './marketData.js';
import { computeIndicatorSeries } from './indicatorEngine.js';
import { buildTradePlan } from './tradePlan.js';

const MIN_CANDLES_REQUIRED = 100;
const VOLUME_LOOKBACK = 20;
const OBV_DIVERGENCE_LOOKBACK = 20;

export async function analyzeTicker(ticker) {
  const history = await fetchDailyHistory(ticker);

  if (history.length < MIN_CANDLES_REQUIRED) {
    return null;
  }

  const lastCandle = history.at(-1);
  const prevCandle = history.at(-2);
  const lastClose = lastCandle.close;
  const lastVolume = lastCandle.volume;
  const transactionValue = lastClose * lastVolume;

  // Filter likuiditas dijalankan dulu, sebelum menghitung indikator/sinyal apa pun.
  const passesLiquidity =
    lastClose > config.minPrice && transactionValue > config.minTransactionValue;

  if (!passesLiquidity) {
    return null;
  }

  const { ema20, ema50, rsi14, atr14, obv } = computeIndicatorSeries(history);
  const lastEma20 = ema20.at(-1);
  const lastEma50 = ema50.at(-1);
  const prevEma20 = ema20.at(-2);
  const prevEma50 = ema50.at(-2);
  const lastRsi = rsi14.at(-1);
  const prevRsi = rsi14.at(-2);
  const lastAtr = atr14.at(-1);

  const hasCompleteIndicators = [lastEma20, lastEma50, prevEma20, prevEma50, lastRsi, prevRsi, lastAtr]
    .every((value) => value != null);

  if (!hasCompleteIndicators || obv.length < OBV_DIVERGENCE_LOOKBACK) {
    return null;
  }

  const pctChangeToday = ((lastClose - prevCandle.close) / prevCandle.close) * 100;

  const recentVolumes = history.slice(-1 - VOLUME_LOOKBACK, -1).map((candle) => candle.volume);
  const avgVolume = recentVolumes.reduce((sum, volume) => sum + volume, 0) / recentVolumes.length;
  const volumeRatio = avgVolume > 0 ? lastVolume / avgVolume : 0;

  // Bullish Pullback: tren naik sehat, RSI baru koreksi ke zona 35-48.
  const isUptrend = lastClose > lastEma20 && lastEma20 > lastEma50;
  const isPullbackZone = lastRsi >= 35 && lastRsi <= 48;
  const bullishPullback = isUptrend && isPullbackZone;

  // Bullish Reversal: golden cross EMA20/EMA50 baru terjadi (selama belum overbought), atau RSI
  // baru rebound dari oversold. Guard RSI overbought mencegah "mengejar" saham yang sudah naik
  // terlalu jauh di hari yang sama.
  const isNotOverbought = lastRsi < config.rsiOverboughtThreshold;
  const goldenCross =
    prevEma20 <= prevEma50 && lastEma20 > lastEma50 && lastClose > lastEma20 && isNotOverbought;
  const rsiOversoldRecovery =
    prevRsi < config.rsiOversoldThreshold &&
    lastRsi >= config.rsiOversoldThreshold &&
    lastClose > prevCandle.close;
  const bullishReversal = goldenCross || rsiOversoldRecovery;

  // Volume Spike: volume jauh di atas rata-rata dibarengi kenaikan harga signifikan, tapi
  // dilewatkan jika RSI sudah overbought (menghindari entry di puncak lonjakan).
  const volumeSpike =
    volumeRatio >= config.volumeSpikeRatio &&
    pctChangeToday >= config.volumeSpikeMinGainPct &&
    isNotOverbought;

  // Akumulasi Tersembunyi (proxy volume, bukan bandarmology broker asli): OBV bikin rekor
  // tertinggi baru dalam N hari terakhir, tapi harga belum ikut bikin rekor tertinggi — indikasi
  // volume beli menumpuk duluan sebelum harga benar-benar bergerak.
  // OBV gampang "ketipu" oleh saham tidak likuid: satu transaksi besar di saham thin bisa bikin
  // OBV rekor baru padahal cuma noise. Karena itu kategori ini butuh rata-rata nilai transaksi
  // 20 hari yang jauh lebih tinggi dari ambang likuiditas dasar, bukan cuma nilai hari ini.
  const recentCandles = history.slice(-OBV_DIVERGENCE_LOOKBACK);
  const recentObv = obv.slice(-OBV_DIVERGENCE_LOOKBACK);
  const avgTransactionValue =
    recentCandles.reduce((sum, candle) => sum + candle.close * candle.volume, 0) / recentCandles.length;
  const isConsistentlyLiquid = avgTransactionValue >= config.hiddenAccumulationMinAvgValue;
  const obvMadeNewHigh = recentObv.at(-1) === Math.max(...recentObv);
  const priceMadeNewHigh = lastClose === Math.max(...recentCandles.map((candle) => candle.close));
  const hiddenAccumulation =
    obvMadeNewHigh && !priceMadeNewHigh && isNotOverbought && isConsistentlyLiquid;

  const tradePlan = buildTradePlan(lastClose, lastAtr);

  let reversalReason = null;
  if (goldenCross) {
    reversalReason = 'Golden Cross — EMA20 baru memotong ke atas EMA50';
  } else if (rsiOversoldRecovery) {
    reversalReason = 'RSI baru rebound dari area oversold (<' + config.rsiOversoldThreshold + ')';
  }

  return {
    ticker,
    date: lastCandle.date,
    lastClose,
    transactionValue,
    pctChangeToday,
    volumeRatio,
    rsi14: lastRsi,
    ema20: lastEma20,
    ema50: lastEma50,
    atr14: lastAtr,
    ...tradePlan,
    reversalReason,
    matches: {
      bullishPullback,
      bullishReversal,
      volumeSpike,
      hiddenAccumulation,
    },
  };
}
