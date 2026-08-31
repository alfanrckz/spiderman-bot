import { STOCK_UNIVERSE } from '../data/stockUniverse.js';
import { analyzeTicker } from './signalDetector.js';
import { getMarketCondition } from './marketCondition.js';
import { mapWithConcurrency } from '../utils/concurrencyLimiter.js';
import { recordSignalEntries, updateSignalLogOutcomes } from './signalLog.js';
import { config } from '../config/env.js';

function byConfidenceDescending(a, b) {
  return b.confidence - a.confidence;
}

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

  // Diurutkan berdasarkan confidence descending supaya kandidat paling meyakinkan tampil duluan
  // di Telegram — confidence adalah proxy konfluensi teknikal, bukan probabilitas tervalidasi.
  const bullishPullback = liquidResults.filter((result) => result.matches.bullishPullback).sort(byConfidenceDescending);
  const bullishReversal = liquidResults.filter((result) => result.matches.bullishReversal).sort(byConfidenceDescending);
  const volumeSpike = liquidResults.filter((result) => result.matches.volumeSpike).sort(byConfidenceDescending);
  const hiddenAccumulation = liquidResults.filter((result) => result.matches.hiddenAccumulation).sort(byConfidenceDescending);

  const result = { bullishPullback, bullishReversal, volumeSpike, hiddenAccumulation };

  if (config.signalLogEnabled) {
    try {
      await recordSignalEntries(result);
      await updateSignalLogOutcomes();
    } catch (error) {
      console.error('[scanner] Gagal update signal log:', error.message);
    }
  }

  return result;
}

export function countActionableSignals(result) {
  return (
    result.bullishPullback.length +
    result.bullishReversal.length +
    result.volumeSpike.length +
    result.hiddenAccumulation.length
  );
}
