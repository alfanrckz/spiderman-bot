import { fetchDailyHistory } from './marketData.js';
import { computeIndicatorSeries } from './indicatorEngine.js';

const IHSG_TICKER = '^JKSE';

// "Jangan melawan arus pasar" — sinyal beli per-saham jauh lebih sering gagal kalau IHSG sendiri
// lagi downtrend. Dicek SEKALI per scan (bukan per ticker) lalu dipakai sebagai gate tambahan di
// semua kategori sinyal.
export async function getMarketCondition() {
  try {
    const history = await fetchDailyHistory(IHSG_TICKER);

    if (history.length < 50) {
      throw new Error('data IHSG tidak cukup');
    }

    const { ema20, ema50 } = computeIndicatorSeries(history);
    const lastClose = history.at(-1).close;
    const lastEma20 = ema20.at(-1);
    const lastEma50 = ema50.at(-1);

    const isBullish =
      lastEma20 != null && lastEma50 != null && lastClose > lastEma20 && lastEma20 > lastEma50;

    return {
      isBullish,
      available: true,
      lastClose,
      ema20: lastEma20,
      ema50: lastEma50,
    };
  } catch (error) {
    // Gagal ambil data IHSG jangan sampai bikin seluruh scan mati — anggap netral (tidak
    // memblokir sinyal) dan catat di log.
    console.error('[marketCondition] Gagal cek kondisi IHSG, filter pasar dilewati kali ini:', error.message);
    return { isBullish: true, available: false };
  }
}
