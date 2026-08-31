import { config } from '../config/env.js';
import { fetchDailyHistory } from './marketData.js';
import { computeIndicatorSeries } from './indicatorEngine.js';
import { buildTradePlan } from './tradePlan.js';

const MIN_CANDLES_REQUIRED = 100;
const VOLUME_LOOKBACK = 20;
const OBV_DIVERGENCE_LOOKBACK = 20;
const EMA50_SLOPE_LOOKBACK = 10;

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Rata-rata ATR% (atr14/close) dalam window sepanjang `days`, dimulai `startOffsetFromEnd` hari
// dari hari terakhir (0 = hari ini). Dipakai untuk mendeteksi volatility-contraction ("squeeze")
// — breakout asli biasanya didahului periode volatilitas menyempit, pump/berita satu-hari
// biasanya tidak.
function averageAtrPct(atr14, closes, startOffsetFromEnd, days) {
  const values = [];
  for (let d = startOffsetFromEnd; d < startOffsetFromEnd + days; d++) {
    const atr = atr14.at(-1 - d);
    const close = closes.at(-1 - d);
    if (atr == null || close == null || close <= 0) return null;
    values.push(atr / close);
  }
  return average(values);
}

// Rasio ATR% window "recent" vs window "base" sebelumnya (<=1 berarti volatilitas sedang
// menyempit dibanding baseline). `excludeDays` menggeser window "recent" menjauh dari hari
// terakhir — dipakai Volume Spike supaya ATR hari spike sendiri (sudah terinflasi oleh spike itu
// sendiri) tidak ikut dihitung sebagai bagian dari "setup"-nya.
function computeAtrPctRatio(atr14, closes, { excludeDays = 0, recentDays, baseDays }) {
  const recentAvg = averageAtrPct(atr14, closes, excludeDays, recentDays);
  const baseAvg = averageAtrPct(atr14, closes, excludeDays + recentDays, baseDays);

  if (recentAvg == null || baseAvg == null || baseAvg <= 0) return null;
  return recentAvg / baseAvg;
}

// OBV kumulatif tidak punya makna di nilai mutlaknya, jadi slope-nya dinormalisasi oleh range OBV
// sendiri dalam window yang sama. slopeRatio > 0 berarti rata-rata OBV terkini lebih tinggi dari
// rata-rata sebelumnya — akumulasi berkelanjutan multi-hari, bukan cuma satu print besar (yang
// gampang ketipu di saham tipis, lihat catatan di README kategori Akumulasi Tersembunyi).
function computeObvSlope(obv, recentDays, baseDays) {
  const windowDays = recentDays + baseDays;
  const window = obv.slice(-windowDays);
  if (window.length < windowDays) return null;

  const recentValues = obv.slice(-recentDays);
  const baseValues = window.slice(0, baseDays);
  const recentAvg = average(recentValues);
  const baseAvg = average(baseValues);
  const obvRange = Math.max(...window) - Math.min(...window);

  if (obvRange <= 0) return null;

  return {
    slopeRatio: (recentAvg - baseAvg) / obvRange,
    recentAvg,
    baseMax: Math.max(...baseValues),
  };
}

// Menghitung semua indikator & kategori sinyal dari history yang sudah di-fetch, TANPA filter
// likuiditas — dipakai baik oleh analyzeTicker() (scan, dengan filter likuiditas di bawah) maupun
// positionTracker.js (/entry, di mana likuiditas tidak relevan karena user sudah benar-benar beli).
// marketCondition (dari getMarketCondition(), dicek sekali per scan) jadi gate tambahan di semua
// kategori — "jangan melawan arus": sinyal beli per-saham jauh lebih sering gagal kalau IHSG
// sendiri lagi downtrend.
export function computeSignalMatches(ticker, history, marketCondition = { isBullish: true }) {
  if (history.length < OBV_DIVERGENCE_LOOKBACK + 1) {
    return null;
  }

  const lastCandle = history.at(-1);
  const prevCandle = history.at(-2);
  const lastClose = lastCandle.close;
  const lastVolume = lastCandle.volume;
  const transactionValue = lastClose * lastVolume;

  const closes = history.map((candle) => candle.close);
  const volumes = history.map((candle) => candle.volume);
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

  const isMarketBullish = marketCondition?.isBullish !== false;
  const isNotOverbought = lastRsi < config.rsiOverboughtThreshold;

  const pctChangeToday = ((lastClose - prevCandle.close) / prevCandle.close) * 100;

  // Rasio volume hari `offset` (0 = hari ini) vs rata-rata 20 hari sebelum hari itu.
  function volumeRatioAt(offset) {
    const windowEnd = volumes.length - offset;
    const window = volumes.slice(windowEnd - 1 - VOLUME_LOOKBACK, windowEnd - 1);
    const volume = volumes.at(-1 - offset);
    if (window.length < VOLUME_LOOKBACK || volume == null) return null;
    const avg = average(window);
    return avg > 0 ? volume / avg : null;
  }
  const volumeRatio = volumeRatioAt(0) ?? 0;

  // EMA50 masih naik dibanding ~2 minggu lalu, dihitung dari hari `offset` (0 = hari ini).
  function isEma50RisingAt(offset) {
    const emaLong = ema50.at(-1 - offset);
    const emaLongAgo = ema50.length > offset + EMA50_SLOPE_LOOKBACK
      ? ema50.at(-1 - offset - EMA50_SLOPE_LOOKBACK)
      : null;
    if (emaLong == null || emaLongAgo == null) return false;
    return emaLong > emaLongAgo;
  }

  // Tren naik penuh (Close>EMA20>EMA50 + EMA50 naik) dihitung dari hari `offset`.
  function isUptrendAt(offset) {
    const emaShort = ema20.at(-1 - offset);
    const emaLong = ema50.at(-1 - offset);
    const close = closes.at(-1 - offset);
    if ([emaShort, emaLong, close].some((value) => value == null)) return false;
    return close > emaShort && emaShort > emaLong && isEma50RisingAt(offset);
  }

  // ---- Bullish Pullback: tren naik harus BERTAHAN beberapa hari terakhir (bukan cuma hari ini)
  // supaya bukan cuma EMA20 baru saja lewat di atas EMA50 sesaat. RSI pullback zone tetap dicek
  // hari ini saja — memang harus jadi momen dip yang baru, bukan kondisi berkepanjangan.
  let uptrendPersistentDays = 0;
  for (let d = 0; d < config.pullbackTrendPersistenceDays; d++) {
    if (!isUptrendAt(d)) break;
    uptrendPersistentDays++;
  }
  const isUptrendPersistent = uptrendPersistentDays >= config.pullbackTrendPersistenceDays;
  const isPullbackZone = lastRsi >= 35 && lastRsi <= 48;
  const bullishPullback = isUptrendPersistent && isPullbackZone && isMarketBullish;

  // ---- Bullish Reversal: cari hari terjadinya golden cross / RSI oversold recovery dalam window
  // lookback, lalu wajibkan kondisinya BERTAHAN sampai hari ini (anti-whipsaw) — bukan cuma
  // trigger persis di hari kejadiannya seperti sebelumnya (rawan langsung mati besoknya).
  let goldenCross = false;
  let goldenCrossDaysAgo = null;
  for (let d = 0; d <= config.bullishReversalCrossLookbackDays; d++) {
    const emaShortAt = ema20.at(-1 - d);
    const emaLongAt = ema50.at(-1 - d);
    const emaShortBefore = ema20.at(-2 - d);
    const emaLongBefore = ema50.at(-2 - d);
    if ([emaShortAt, emaLongAt, emaShortBefore, emaLongBefore].some((value) => value == null)) break;

    const crossedThatDay = emaShortBefore <= emaLongBefore && emaShortAt > emaLongAt;
    if (crossedThatDay) {
      let heldSinceCross = true;
      for (let k = 0; k < d; k++) {
        if (ema20.at(-1 - k) <= ema50.at(-1 - k)) {
          heldSinceCross = false;
          break;
        }
      }
      if (heldSinceCross && lastClose > lastEma20 && isNotOverbought) {
        goldenCross = true;
        goldenCrossDaysAgo = d;
      }
      break;
    }
  }

  let rsiOversoldRecovery = false;
  let rsiRecoveryDaysAgo = null;
  for (let d = 0; d <= config.bullishReversalCrossLookbackDays; d++) {
    const rsiAt = rsi14.at(-1 - d);
    const rsiBefore = rsi14.at(-2 - d);
    const closeAt = closes.at(-1 - d);
    const closeBefore = closes.at(-2 - d);
    if ([rsiAt, rsiBefore, closeAt, closeBefore].some((value) => value == null)) break;

    const recoveredThatDay =
      rsiBefore < config.rsiOversoldThreshold && rsiAt >= config.rsiOversoldThreshold && closeAt > closeBefore;
    if (recoveredThatDay) {
      let heldSinceRecovery = true;
      for (let k = 0; k < d; k++) {
        if (rsi14.at(-1 - k) < config.rsiOversoldThreshold) {
          heldSinceRecovery = false;
          break;
        }
      }
      if (heldSinceRecovery && lastClose > closeAt) {
        rsiOversoldRecovery = true;
        rsiRecoveryDaysAgo = d;
      }
      break;
    }
  }

  const bullishReversal = (goldenCross || rsiOversoldRecovery) && isMarketBullish;

  // ---- Volume Spike: volume jauh di atas rata-rata dibarengi kenaikan harga signifikan, plus
  // syarat volatility-contraction ("squeeze") di hari-hari SEBELUM spike — breakout asli biasanya
  // didahului periode volatilitas menyempit, pump/berita satu-hari biasanya tidak. Dilewatkan
  // kalau RSI sudah overbought. Candle-nya juga wajib "closed strong" — ditutup di bagian atas
  // range hari itu — supaya bukan spike yang langsung dijual turun (spike-and-fade).
  // Entry-nya SENGAJA tidak pakai Close hari spike — itu harga paling euforia/mahal hari itu,
  // beli di situ artinya chasing dan sering langsung koreksi besoknya. Entry disarankan di area
  // retracement EMA20, SL/TP dihitung ulang dari level itu, bukan dari Close.
  const dayRange = lastCandle.high - lastCandle.low;
  const closeStrength = dayRange > 0 ? (lastClose - lastCandle.low) / dayRange : 1;
  const closedStrong = closeStrength >= config.volumeSpikeMinCloseStrength;
  const volumeSpikeEntryPrice = lastEma20;
  const hasValidPullbackZone = volumeSpikeEntryPrice != null && volumeSpikeEntryPrice < lastClose;

  const squeezeRatio = computeAtrPctRatio(atr14, closes, {
    excludeDays: 1,
    recentDays: config.volumeSpikeSqueezeLookbackDays,
    baseDays: config.volumeSpikeSqueezeBaseDays,
  });
  const isSqueezePresent = squeezeRatio != null && squeezeRatio <= config.volumeSpikeSqueezeMaxRatio;

  const volumeSpike =
    volumeRatio >= config.volumeSpikeRatio &&
    pctChangeToday >= config.volumeSpikeMinGainPct &&
    isNotOverbought &&
    hasValidPullbackZone &&
    closedStrong &&
    isSqueezePresent &&
    isMarketBullish;
  const volumeSpikeTradePlan = hasValidPullbackZone
    ? buildTradePlan(volumeSpikeEntryPrice, lastAtr)
    : null;

  // ---- Akumulasi Tersembunyi (proxy volume, *bukan* bandarmology broker asli): OBV harus naik
  // KONSISTEN multi-hari (bukan cuma rekor tertinggi 1 hari) sementara harga belum ikut mencetak
  // rekor tertinggi — indikasi volume beli menumpuk lebih dulu sebelum harga bergerak. Multi-hari
  // ini penting: satu transaksi besar di saham tipis bisa bikin OBV rekor baru dalam 1 hari
  // padahal cuma noise, bukan akumulasi sungguhan (lihat catatan README).
  const recentCandles = history.slice(-OBV_DIVERGENCE_LOOKBACK);
  const avgTransactionValue =
    recentCandles.reduce((sum, candle) => sum + candle.close * candle.volume, 0) / recentCandles.length;
  const isConsistentlyLiquid =
    transactionValue >= config.hiddenAccumulationMinAvgValue &&
    avgTransactionValue >= config.hiddenAccumulationMinAvgValue;

  const obvSlope = computeObvSlope(
    obv,
    config.hiddenAccumulationObvRecentWindowDays,
    config.hiddenAccumulationObvBaseWindowDays
  );
  const isObvSustainedRise =
    obvSlope != null &&
    obvSlope.slopeRatio >= config.hiddenAccumulationMinObvSlopeRatio &&
    obvSlope.recentAvg > obvSlope.baseMax;

  const priceMadeNewHigh = lastClose === Math.max(...recentCandles.map((candle) => candle.close));
  const hiddenAccumulation =
    isObvSustainedRise && !priceMadeNewHigh && isNotOverbought && isConsistentlyLiquid && isMarketBullish;

  const tradePlan = buildTradePlan(lastClose, lastAtr);

  let reversalReason = null;
  if (goldenCross) {
    reversalReason =
      goldenCrossDaysAgo === 0
        ? 'Golden Cross — EMA20 baru memotong ke atas EMA50 hari ini'
        : `Golden Cross — EMA20 memotong ke atas EMA50 ${goldenCrossDaysAgo} hari lalu, masih bertahan sampai hari ini`;
  } else if (rsiOversoldRecovery) {
    reversalReason =
      rsiRecoveryDaysAgo === 0
        ? `RSI baru rebound dari area oversold (<${config.rsiOversoldThreshold}) hari ini`
        : `RSI rebound dari area oversold (<${config.rsiOversoldThreshold}) ${rsiRecoveryDaysAgo} hari lalu, harga masih melanjutkan naik`;
  }

  // ---- Confidence score: konfluensi 6 dimensi teknikal independen (di luar gate wajib tiap
  // kategori seperti isMarketBullish, yang selalu true kalau sampai di titik ini). Ini PROXY
  // konfluensi, bukan probabilitas tervalidasi — validasi sebenarnya baru datang dari signalLog
  // (win-rate riil per bucket confidence, dihitung dari data berjalan).
  const recentVolumeRatios = [0, 1, 2].map(volumeRatioAt).filter((value) => value != null);
  const volumeSustained =
    recentVolumeRatios.length === 3 && average(recentVolumeRatios) >= config.confirmationVolumeSustainedRatio;

  const confidenceVolatilityRatio = computeAtrPctRatio(atr14, closes, {
    excludeDays: 0,
    recentDays: config.volumeSpikeSqueezeLookbackDays,
    baseDays: config.volumeSpikeSqueezeBaseDays,
  });
  const volatilityContained =
    confidenceVolatilityRatio != null &&
    confidenceVolatilityRatio <= config.confirmationVolatilityContainedMaxRatio;

  const confirmations = {
    trendAligned: lastClose > lastEma20 && lastEma20 > lastEma50,
    emaSlopeRising: isEma50RisingAt(0),
    volumeSustained,
    obvRising: obvSlope != null && obvSlope.slopeRatio > 0,
    rsiHealthyZone: lastRsi >= config.confirmationRsiHealthyMin && lastRsi <= config.confirmationRsiHealthyMax,
    volatilityContained,
  };
  const confidence = Object.values(confirmations).filter(Boolean).length;
  const confidenceMax = Object.keys(confirmations).length;

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
    volumeSpikeEntry: volumeSpikeTradePlan?.entry,
    volumeSpikeStopLoss: volumeSpikeTradePlan?.stopLoss,
    volumeSpikeTakeProfit: volumeSpikeTradePlan?.takeProfit,
    reversalReason,
    confirmations,
    confidence,
    confidenceMax,
    matches: {
      bullishPullback,
      bullishReversal,
      volumeSpike,
      hiddenAccumulation,
    },
  };
}

export async function analyzeTicker(ticker, marketCondition) {
  const history = await fetchDailyHistory(ticker);

  if (history.length < MIN_CANDLES_REQUIRED) {
    return null;
  }

  const lastCandle = history.at(-1);
  const lastClose = lastCandle.close;
  const lastVolume = lastCandle.volume;
  const transactionValue = lastClose * lastVolume;

  // Filter likuiditas dijalankan dulu, sebelum menghitung indikator/sinyal apa pun.
  const passesLiquidity =
    lastClose > config.minPrice && transactionValue > config.minTransactionValue;

  if (!passesLiquidity) {
    return null;
  }

  return computeSignalMatches(ticker, history, marketCondition);
}
