import { STOCK_UNIVERSE } from '../data/stockUniverse.js';
import { analyzeTicker } from './signalDetector.js';
import { getMarketCondition } from './marketCondition.js';
import { mapWithConcurrency } from '../utils/concurrencyLimiter.js';
import { config } from '../config/env.js';

export async function runSwingScan() {
  const marketCondition = await getMarketCondition();
  console.log(
    `[scanner] Kondisi IHSG: ${marketCondition.isBullish ? 'BULLISH' : 'BEARISH/NEUTRAL'}` +
      (marketCondition.available ? '' : ' (data tidak tersedia, filter dilewati)')
  );

  const analyzed = await mapWithConcurrency(
    STOCK_UNIVERSE,
    config.scanConcurrency,
    async (ticker) => {
      try {
        return await analyzeTicker(ticker, marketCondition);
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
  const hiddenAccumulation = liquidResults.filter((result) => result.matches.hiddenAccumulation);

  return { bullishPullback, bullishReversal, volumeSpike, hiddenAccumulation };
}

export function countActionableSignals(result) {
  return (
    result.bullishPullback.length +
    result.bullishReversal.length +
    result.volumeSpike.length +
    result.hiddenAccumulation.length
  );
}
