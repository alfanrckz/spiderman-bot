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

const CONFIRMATION_LABELS = {
  trendAligned: 'Tren',
  emaSlopeRising: 'Slope',
  volumeSustained: 'Volume',
  obvRising: 'OBV',
  rsiHealthyZone: 'RSI',
  volatilityContained: 'Volatilitas',
};

// Confidence = konfluensi teknikal (berapa dari 6 dimensi independen yang sejalan), BUKAN
// probabilitas tervalidasi — sengaja tidak dilabeli "win probability" atau skor /100.
function formatConfidenceLine(signal) {
  const detail = Object.entries(signal.confirmations)
    .map(([key, value]) => `${CONFIRMATION_LABELS[key]}${value ? '✓' : '✗'}`)
    .join(' ');
  return `⭐ Confidence: ${signal.confidence}/${signal.confidenceMax} (${detail})`;
}

function formatTradeLines(entry, stopLoss, takeProfit, atr14, entryLabel = 'Entry') {
  const gainPct = ((takeProfit - entry) / entry) * 100;
  const lossPct = ((entry - stopLoss) / entry) * 100;

  return [
    `🎯 *${entryLabel}:* Rp ${integerFormatter.format(entry)}`,
    `✅ *Take Profit:* Rp ${integerFormatter.format(takeProfit)} (+${decimalFormatter.format(gainPct)}%)`,
    `🛑 *Stop Loss:* Rp ${integerFormatter.format(stopLoss)} (-${decimalFormatter.format(lossPct)}%)`,
    `⚖️ Risk:Reward ≈ 1:2 (ATR14 = ${integerFormatter.format(atr14)})`,
  ];
}

function formatBullishPullbackBlock(signal) {
  return [
    `🟢 *BULLISH PULLBACK*`,
    ``,
    ...formatBaseLines(signal),
    formatConfidenceLine(signal),
    ``,
    ...formatTradeLines(signal.entry, signal.stopLoss, signal.takeProfit, signal.atr14),
    ``,
    `📝 Tren naik sehat (Close > EMA20 > EMA50), RSI di zona pullback (35-48). Cocok untuk entry swing.`,
  ].join('\n');
}

function formatBullishReversalBlock(signal) {
  return [
    `🔄 *BULLISH REVERSAL*`,
    ``,
    ...formatBaseLines(signal),
    formatConfidenceLine(signal),
    ``,
    ...formatTradeLines(signal.entry, signal.stopLoss, signal.takeProfit, signal.atr14),
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
    formatConfidenceLine(signal),
    ``,
    `⏳ *Jangan beli di harga penutupan hari ini* — itu harga paling euforia/mahal hari spike.`,
    `Tunggu retracement wajar ke area EMA20 dulu, baru entry dari situ:`,
    ``,
    ...formatTradeLines(
      signal.volumeSpikeEntry,
      signal.volumeSpikeStopLoss,
      signal.volumeSpikeTakeProfit,
      signal.atr14,
      'Entry (area EMA20)'
    ),
    ``,
    `📝 Lonjakan volume + harga naik ${decimalFormatter.format(signal.pctChangeToday)}% hari ini menandakan minat beli besar, tapi entry di puncak euforia sering langsung dikoreksi besoknya. Kalau harga tidak pernah retest ke area ini, lewati saja — jangan chasing.`,
  ].join('\n');
}

function formatHiddenAccumulationBlock(signal) {
  return [
    `🐋 *AKUMULASI TERSEMBUNYI*`,
    ``,
    ...formatBaseLines(signal),
    formatConfidenceLine(signal),
    ``,
    ...formatTradeLines(signal.entry, signal.stopLoss, signal.takeProfit, signal.atr14),
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
