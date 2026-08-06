import { STOCK_UNIVERSE } from '../data/stockUniverse.js';
import { analyzeTicker } from './signalDetector.js';
import { mapWithConcurrency } from '../utils/concurrencyLimiter.js';
import { config } from '../config/env.js';

export async function runSwingScan() {
  const analyzed = await mapWithConcurrency(
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

  const liquidResults = analyzed.filter(Boolean);

  const bullishPullback = liquidResults.filter((result) => result.matches.bullishPullback);
  const bullishReversal = liquidResults.filter((result) => result.matches.bullishReversal);
  const volumeSpike = liquidResults.filter((result) => result.matches.volumeSpike);

  const topGainers = [...liquidResults]
    .sort((a, b) => b.pctChangeToday - a.pctChangeToday)
    .slice(0, config.topGainersCount);

  return { bullishPullback, bullishReversal, volumeSpike, topGainers };
}

export function countActionableSignals(result) {
  return result.bullishPullback.length + result.bullishReversal.length + result.volumeSpike.length;
}
