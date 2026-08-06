import { STOCK_UNIVERSE } from '../data/stockUniverse.js';
import { analyzeTicker } from './signalDetector.js';
import { mapWithConcurrency } from '../utils/concurrencyLimiter.js';
import { config } from '../config/env.js';

export async function runSwingScan() {
  const results = await mapWithConcurrency(
    STOCK_UNIVERSE,
    config.scanConcurrency,
    async (ticker) => {
      try {
        return await analyzeTicker(ticker);
      } catch (error) {
        console.error(`[scanner] Gagal menganalisis ${ticker}:`, error.message);
        return null;
      }
    }
  );

  return results.filter(Boolean);
}
