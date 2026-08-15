const integerFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const signedDecimalFormatter = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
});

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

function tickerCodeOf(signal) {
  return signal.ticker.replace('.JK', '');
}

function formatBaseLines(signal) {
  const transactionInBillions = signal.transactionValue / 1_000_000_000;

  return [
    `📌 #${tickerCodeOf(signal)}`,
    `💰 Harga Penutupan: Rp ${integerFormatter.format(signal.lastClose)} (${signedDecimalFormatter.format(signal.pctChangeToday)}%)`,
    `📊 Nilai Transaksi: Rp ${decimalFormatter.format(transactionInBillions)} Miliar`,
    `📈 RSI (14): ${decimalFormatter.format(signal.rsi14)}`,
    `📉 EMA 20: ${integerFormatter.format(signal.ema20)} | EMA 50: ${integerFormatter.format(signal.ema50)}`,
  ];
}

function formatTradeLines(signal) {
  const gainPct = ((signal.takeProfit - signal.entry) / signal.entry) * 100;
  const lossPct = ((signal.entry - signal.stopLoss) / signal.entry) * 100;

  return [
    `🎯 *Entry:* Rp ${integerFormatter.format(signal.entry)}`,
    `✅ *Take Profit:* Rp ${integerFormatter.format(signal.takeProfit)} (+${decimalFormatter.format(gainPct)}%)`,
    `🛑 *Stop Loss:* Rp ${integerFormatter.format(signal.stopLoss)} (-${decimalFormatter.format(lossPct)}%)`,
    `⚖️ Risk:Reward ≈ 1:2 (ATR14 = ${integerFormatter.format(signal.atr14)})`,
  ];
}

function formatBullishPullbackBlock(signal) {
  return [
    `🟢 *BULLISH PULLBACK*`,
    ``,
    ...formatBaseLines(signal),
    ``,
    ...formatTradeLines(signal),
    ``,
    `📝 Tren naik sehat (Close > EMA20 > EMA50), RSI di zona pullback (35-48). Cocok untuk entry swing.`,
  ].join('\n');
}

function formatBullishReversalBlock(signal) {
  return [
    `🔄 *BULLISH REVERSAL*`,
    ``,
    ...formatBaseLines(signal),
    ``,
    ...formatTradeLines(signal),
    ``,
    `📝 ${signal.reversalReason}. Potensi awal tren naik baru — cocok untuk swing/intraday.`,
  ].join('\n');
}

function formatVolumeSpikeBlock(signal) {
  return [
    `🚀 *VOLUME SPIKE*`,
    ``,
    ...formatBaseLines(signal),
    `🔊 Volume: ${decimalFormatter.format(signal.volumeRatio)}x rata-rata 20 hari`,
    ``,
    ...formatTradeLines(signal),
    ``,
    `📝 Lonjakan volume dibarengi harga naik ${decimalFormatter.format(signal.pctChangeToday)}% — indikasi minat beli besar, pantau untuk intraday/swing cepat.`,
  ].join('\n');
}

function formatHiddenAccumulationBlock(signal) {
  return [
    `🐋 *AKUMULASI TERSEMBUNYI*`,
    ``,
    ...formatBaseLines(signal),
    ``,
    ...formatTradeLines(signal),
    ``,
    `📝 OBV bikin rekor tertinggi 20 hari, tapi harga belum ikut — indikasi volume beli menumpuk duluan (proxy volume, bukan data broker asli). Potensi breakout menyusul.`,
  ].join('\n');
}

const CATEGORY_LABELS = {
  bullishPullback: 'Bullish Pullback',
  bullishReversal: 'Bullish Reversal',
  volumeSpike: 'Volume Spike',
  hiddenAccumulation: 'Akumulasi Tersembunyi',
};

function formatPositionBlock(evaluated) {
  const tickerCode = tickerCodeOf(evaluated);
  const categoryLabel = evaluated.category ? CATEGORY_LABELS[evaluated.category] : 'Manual';

  const lines = [
    `📌 #${tickerCode} (${categoryLabel})`,
    `Entry: Rp ${integerFormatter.format(evaluated.entry)} | Sekarang: Rp ${integerFormatter.format(evaluated.lastClose)} (${signedDecimalFormatter.format(evaluated.pnlPct)}%)`,
    `SL: Rp ${integerFormatter.format(evaluated.stopLoss)} | TP: Rp ${integerFormatter.format(evaluated.takeProfit)}`,
  ];

  if (evaluated.status === 'TAKE_PROFIT_HIT') {
    lines.unshift(`✅ *TAKE PROFIT HIT — KELUAR*`);
    lines.push(`📝 ${evaluated.reason} Posisi otomatis dihapus dari daftar.`);
  } else if (evaluated.status === 'STOP_LOSS_HIT') {
    lines.unshift(`🛑 *STOP LOSS HIT — KELUAR*`);
    lines.push(`📝 ${evaluated.reason} Posisi otomatis dihapus dari daftar.`);
  } else if (evaluated.status === 'INVALIDATED') {
    lines.unshift(`⚠️ *REKOMENDASI KELUAR*`);
    lines.push(`📝 ${evaluated.reason} Gunakan /close ${tickerCode} kalau sudah Anda tutup posisinya.`);
  } else {
    lines.unshift(evaluated.pnlPct >= 0 ? `🟢 *HOLD*` : `🟡 *HOLD*`);
  }

  return lines.join('\n');
}

// Mengembalikan array pesan (chunk) status posisi yang sedang dilacak via /entry.
export function formatPositionsSummary(evaluatedPositions) {
  if (evaluatedPositions.length === 0) {
    return [
      '📁 *Status Posisi Anda*\n_Belum ada posisi yang dilacak. Gunakan /entry TICKER setelah Anda benar-benar entry._',
    ];
  }

  const header = `📁 *Status Posisi Anda* (${evaluatedPositions.length} posisi)`;
  return chunkBlocks([header, ...evaluatedPositions.map(formatPositionBlock)]);
}

function buildSectionBlocks(title, items, blockFormatter, emptyText) {
  if (items.length === 0) {
    return [`${title}\n${emptyText}`];
  }

  return [`${title}\nDitemukan ${items.length} kandidat:`, ...items.map(blockFormatter)];
}

function chunkBlocks(blocks) {
  const chunks = [];
  let current = '';

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n———\n\n${block}` : block;

    if (candidate.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      if (current) chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// Mengembalikan array pesan (chunk) agar tidak melebihi batas 4096 karakter Telegram.
export function formatScanSummary(result) {
  const emptyText = '_Tidak ada kandidat saat ini._';

  const blocks = [
    `🔍 *Hasil Scan Saham BEI (Swing & Intraday)*`,
    ...buildSectionBlocks('🟢 *Bullish Pullback* (swing)', result.bullishPullback, formatBullishPullbackBlock, emptyText),
    ...buildSectionBlocks('🔄 *Bullish Reversal* (swing/intraday)', result.bullishReversal, formatBullishReversalBlock, emptyText),
    ...buildSectionBlocks('🚀 *Volume Spike* (intraday)', result.volumeSpike, formatVolumeSpikeBlock, emptyText),
    ...buildSectionBlocks('🐋 *Akumulasi Tersembunyi* (proxy volume/OBV)', result.hiddenAccumulation, formatHiddenAccumulationBlock, emptyText),
  ];

  return chunkBlocks(blocks);
}
