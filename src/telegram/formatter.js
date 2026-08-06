const integerFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export function formatSignalMessage(signal) {
  const transactionInBillions = signal.transactionValue / 1_000_000_000;
  const tickerCode = signal.ticker.replace('.JK', '');
  const potentialGainPct = ((signal.takeProfit - signal.entry) / signal.entry) * 100;
  const potentialLossPct = ((signal.entry - signal.stopLoss) / signal.entry) * 100;

  return [
    `🟢 *SINYAL BUY - BULLISH PULLBACK*`,
    ``,
    `📌 #${tickerCode}`,
    `💰 Harga Penutupan: Rp ${integerFormatter.format(signal.lastClose)}`,
    `📊 Nilai Transaksi: Rp ${decimalFormatter.format(transactionInBillions)} Miliar`,
    `📈 RSI (14): ${decimalFormatter.format(signal.rsi14)}`,
    `📉 EMA 20: ${integerFormatter.format(signal.ema20)}`,
    `📉 EMA 50: ${integerFormatter.format(signal.ema50)}`,
    ``,
    `🎯 *Entry:* Rp ${integerFormatter.format(signal.entry)}`,
    `✅ *Take Profit:* Rp ${integerFormatter.format(signal.takeProfit)} (+${decimalFormatter.format(potentialGainPct)}%)`,
    `🛑 *Stop Loss:* Rp ${integerFormatter.format(signal.stopLoss)} (-${decimalFormatter.format(potentialLossPct)}%)`,
    `⚖️ Risk:Reward ≈ 1:2 (ATR14 = ${integerFormatter.format(signal.atr14)})`,
    ``,
    `📝 Tren naik sehat (Close > EMA20 > EMA50), RSI berada di zona pullback (35-48). Potensi entry swing trading jangka pendek. Bukan nasihat keuangan — selalu gunakan manajemen risiko Anda sendiri.`,
  ].join('\n');
}

// Mengembalikan array pesan (chunk) agar tidak melebihi batas 4096 karakter Telegram.
export function formatScanSummary(signals) {
  if (signals.length === 0) {
    return ['🔍 *Hasil Scan Swing Trading BEI*\n\nTidak ada saham yang memenuhi kriteria sinyal beli saat ini.'];
  }

  const header = `🔍 *Hasil Scan Swing Trading BEI*\nDitemukan ${signals.length} saham dengan sinyal beli:`;
  const blocks = signals.map(formatSignalMessage);

  const chunks = [];
  let currentChunk = header;

  for (const block of blocks) {
    const candidate = `${currentChunk}\n\n———\n\n${block}`;

    if (candidate.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      chunks.push(currentChunk);
      currentChunk = block;
    } else {
      currentChunk = candidate;
    }
  }

  chunks.push(currentChunk);
  return chunks;
}
