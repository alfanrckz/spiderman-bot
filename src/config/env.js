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
};
