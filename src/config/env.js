import 'dotenv/config';

const requiredKeys = ['BOT_TOKEN', 'CHAT_ID'];
const missingKeys = requiredKeys.filter((key) => !process.env[key]);

if (missingKeys.length > 0) {
  throw new Error(
    `Environment variable wajib belum diisi: ${missingKeys.join(', ')}. Cek file .env Anda.`
  );
}

export const config = {
  botToken: process.env.BOT_TOKEN,
  chatId: process.env.CHAT_ID,
  cronSchedule: process.env.CRON_SCHEDULE || '30 18 * * 1-5',
  timezone: process.env.TZ_NAME || 'Asia/Jakarta',
  minPrice: Number(process.env.MIN_PRICE || 100),
  minTransactionValue: Number(process.env.MIN_TRANSACTION_VALUE || 3_000_000_000),
  historyDays: Number(process.env.HISTORY_DAYS || 200),
  scanConcurrency: Number(process.env.SCAN_CONCURRENCY || 5),
  volumeSpikeRatio: Number(process.env.VOLUME_SPIKE_RATIO || 2),
  volumeSpikeMinGainPct: Number(process.env.VOLUME_SPIKE_MIN_GAIN_PCT || 3),
  rsiOversoldThreshold: Number(process.env.RSI_OVERSOLD_THRESHOLD || 30),
  rsiOverboughtThreshold: Number(process.env.RSI_OVERBOUGHT_THRESHOLD || 70),
  hiddenAccumulationMinAvgValue: Number(process.env.HIDDEN_ACCUMULATION_MIN_AVG_VALUE || 10_000_000_000),
  volumeSpikeMinCloseStrength: Number(process.env.VOLUME_SPIKE_MIN_CLOSE_STRENGTH || 0.5),

  // Akumulasi Tersembunyi: OBV harus naik konsisten multi-hari (bukan cuma rekor 1 hari)
  hiddenAccumulationObvRecentWindowDays: Number(process.env.HIDDEN_ACCUMULATION_OBV_RECENT_WINDOW_DAYS || 5),
  hiddenAccumulationObvBaseWindowDays: Number(process.env.HIDDEN_ACCUMULATION_OBV_BASE_WINDOW_DAYS || 15),
  hiddenAccumulationMinObvSlopeRatio: Number(process.env.HIDDEN_ACCUMULATION_MIN_OBV_SLOPE_RATIO || 0.15),

  // Volume Spike: syarat volatility-contraction ("squeeze") sebelum hari spike
  volumeSpikeSqueezeLookbackDays: Number(process.env.VOLUME_SPIKE_SQUEEZE_LOOKBACK_DAYS || 10),
  volumeSpikeSqueezeBaseDays: Number(process.env.VOLUME_SPIKE_SQUEEZE_BASE_DAYS || 40),
  volumeSpikeSqueezeMaxRatio: Number(process.env.VOLUME_SPIKE_SQUEEZE_MAX_RATIO || 0.85),

  // Bullish Pullback & Reversal: syarat persistensi multi-hari (bukan snapshot 1 hari)
  pullbackTrendPersistenceDays: Number(process.env.PULLBACK_TREND_PERSISTENCE_DAYS || 3),
  bullishReversalCrossLookbackDays: Number(process.env.BULLISH_REVERSAL_CROSS_LOOKBACK_DAYS || 2),

  // Confidence score (confluence teknikal, bukan probabilitas tervalidasi)
  confirmationVolumeSustainedRatio: Number(process.env.CONFIRMATION_VOLUME_SUSTAINED_RATIO || 1.2),
  confirmationRsiHealthyMin: Number(process.env.CONFIRMATION_RSI_HEALTHY_MIN || 40),
  confirmationRsiHealthyMax: Number(process.env.CONFIRMATION_RSI_HEALTHY_MAX || 65),
  confirmationVolatilityContainedMaxRatio: Number(process.env.CONFIRMATION_VOLATILITY_CONTAINED_MAX_RATIO || 1.1),

  // Outcome logging (src/data/signalLog.json) untuk evaluasi win-rate berbasis data
  signalLogEnabled: (process.env.SIGNAL_LOG_ENABLED || 'true') === 'true',
  signalLogOutcomeHorizonsDays: (process.env.SIGNAL_LOG_OUTCOME_HORIZONS_DAYS || '1,3,5')
    .split(',')
    .map(Number),
  signalLogMaxEntries: Number(process.env.SIGNAL_LOG_MAX_ENTRIES || 2000),
};
