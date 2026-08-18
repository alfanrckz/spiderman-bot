import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchDailyHistory } from './marketData.js';
import { computeIndicatorSeries } from './indicatorEngine.js';
import { computeSignalMatches } from './signalDetector.js';
import { buildTradePlan } from './tradePlan.js';
import { commitAndPush } from '../utils/gitSync.js';

const POSITIONS_RELATIVE_PATH = path.join('src', 'data', 'positions.json');
const POSITIONS_ABSOLUTE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'positions.json'
);

// Urutan prioritas kategori dipakai kalau satu ticker cocok lebih dari satu kategori saat /entry.
const CATEGORY_PRIORITY = ['bullishPullback', 'bullishReversal', 'volumeSpike', 'hiddenAccumulation'];

export const POSITION_STATUS = {
  HOLD: 'HOLD',
  TAKE_PROFIT_HIT: 'TAKE_PROFIT_HIT',
  STOP_LOSS_HIT: 'STOP_LOSS_HIT',
  INVALIDATED: 'INVALIDATED',
};

export function loadPositions() {
  const raw = readFileSync(POSITIONS_ABSOLUTE_PATH, 'utf-8');
  return JSON.parse(raw);
}

function savePositions(positions) {
  writeFileSync(POSITIONS_ABSOLUTE_PATH, JSON.stringify(positions, null, 2) + '\n', 'utf-8');
}

async function savePositionsAndSync(positions, commitMessage) {
  savePositions(positions);
  await commitAndPush(POSITIONS_RELATIVE_PATH, commitMessage);
}

function normalizeTicker(tickerInput) {
  const code = tickerInput.trim().toUpperCase().replace('.JK', '');
  return `${code}.JK`;
}

async function analyzeForEntry(ticker) {
  const history = await fetchDailyHistory(ticker);
  const analysis = computeSignalMatches(ticker, history);

  if (!analysis) {
    throw new Error(
      'Data historis tidak cukup untuk menghitung indikator ticker ini (mungkin salah kode, baru IPO, atau terlalu jarang transaksi).'
    );
  }

  return analysis;
}

export async function addPosition(tickerInput, customEntryPrice) {
  const ticker = normalizeTicker(tickerInput);
  const positions = loadPositions();

  if (positions.some((position) => position.ticker === ticker)) {
    throw new Error(`Sudah ada posisi aktif untuk #${ticker.replace('.JK', '')}. Gunakan /close dulu kalau mau reset.`);
  }

  const analysis = await analyzeForEntry(ticker);
  const primaryCategory = CATEGORY_PRIORITY.find((category) => analysis.matches[category]) ?? null;

  // Kalau user /entry TANPA harga custom dan sinyalnya Volume Spike, pakai basis entry area
  // EMA20 (retracement) — konsisten dengan rekomendasi di pesan sinyal, bukan harga penutupan
  // hari spike yang justru paling mahal/euforia.
  const useVolumeSpikeBasis = customEntryPrice == null && analysis.matches.volumeSpike;
  const entry = customEntryPrice ?? (useVolumeSpikeBasis ? analysis.volumeSpikeEntry : analysis.lastClose);
  const tradePlan = buildTradePlan(entry, analysis.atr14);

  const position = {
    ticker,
    entryDate: new Date().toISOString().slice(0, 10),
    entry,
    stopLoss: tradePlan.stopLoss,
    takeProfit: tradePlan.takeProfit,
    atr14: analysis.atr14,
    category: primaryCategory,
  };

  positions.push(position);
  await savePositionsAndSync(positions, `chore: tambah posisi ${ticker}`);

  return position;
}

export async function removePosition(tickerInput) {
  const ticker = normalizeTicker(tickerInput);
  const positions = loadPositions();
  const exists = positions.some((position) => position.ticker === ticker);

  if (!exists) {
    throw new Error(`Tidak ada posisi aktif untuk #${ticker.replace('.JK', '')}.`);
  }

  const remaining = positions.filter((position) => position.ticker !== ticker);
  await savePositionsAndSync(remaining, `chore: tutup posisi ${ticker}`);
  return ticker;
}

export async function evaluatePosition(position) {
  const history = await fetchDailyHistory(position.ticker);
  const lastCandle = history.at(-1);
  const lastClose = lastCandle.close;
  const { ema20, ema50, obv } = computeIndicatorSeries(history);
  const lastEma20 = ema20.at(-1);
  const lastEma50 = ema50.at(-1);

  const pnlPct = ((lastClose - position.entry) / position.entry) * 100;

  if (lastClose <= position.stopLoss) {
    return {
      ...position,
      lastClose,
      pnlPct,
      status: POSITION_STATUS.STOP_LOSS_HIT,
      reason: `Harga (Rp${lastClose}) menembus Stop Loss (Rp${Math.round(position.stopLoss)}).`,
    };
  }

  if (lastClose >= position.takeProfit) {
    return {
      ...position,
      lastClose,
      pnlPct,
      status: POSITION_STATUS.TAKE_PROFIT_HIT,
      reason: `Harga (Rp${lastClose}) mencapai Take Profit (Rp${Math.round(position.takeProfit)}).`,
    };
  }

  if (position.category === 'bullishPullback' && lastEma50 != null && lastClose < lastEma50) {
    return {
      ...position,
      lastClose,
      pnlPct,
      status: POSITION_STATUS.INVALIDATED,
      reason: 'Harga sudah di bawah EMA50 — tren naik yang jadi dasar sinyal sudah rusak.',
    };
  }

  if (position.category === 'bullishReversal' && lastEma20 != null && lastEma50 != null && lastEma20 < lastEma50) {
    return {
      ...position,
      lastClose,
      pnlPct,
      status: POSITION_STATUS.INVALIDATED,
      reason: 'EMA20 sudah kembali di bawah EMA50 (dead cross) — reversal gagal.',
    };
  }

  if (position.category === 'volumeSpike' && lastEma20 != null && lastClose < lastEma20) {
    return {
      ...position,
      lastClose,
      pnlPct,
      status: POSITION_STATUS.INVALIDATED,
      reason: 'Harga sudah di bawah EMA20 — momentum lonjakan volume mereda.',
    };
  }

  if (position.category === 'hiddenAccumulation') {
    const recentObv = obv.slice(-20);
    const obvMadeNewLow = recentObv.length > 0 && recentObv.at(-1) === Math.min(...recentObv);
    if (obvMadeNewLow) {
      return {
        ...position,
        lastClose,
        pnlPct,
        status: POSITION_STATUS.INVALIDATED,
        reason: 'OBV mencetak rekor terendah baru — tesis akumulasi batal.',
      };
    }
  }

  return { ...position, lastClose, pnlPct, status: POSITION_STATUS.HOLD, reason: null };
}

export async function evaluateAllPositions() {
  const positions = loadPositions();
  const evaluated = [];

  for (const position of positions) {
    try {
      evaluated.push(await evaluatePosition(position));
    } catch (error) {
      console.error(`[positionTracker] Gagal evaluasi posisi ${position.ticker}:`, error.message);
    }
  }

  const stillOpen = evaluated
    .filter((item) => item.status === POSITION_STATUS.HOLD || item.status === POSITION_STATUS.INVALIDATED)
    .map(({ status, reason, lastClose, pnlPct, ...position }) => position);

  const closedAutomatically = evaluated.filter(
    (item) => item.status === POSITION_STATUS.TAKE_PROFIT_HIT || item.status === POSITION_STATUS.STOP_LOSS_HIT
  );

  if (closedAutomatically.length > 0) {
    await savePositionsAndSync(
      stillOpen,
      `chore: auto-close ${closedAutomatically.map((p) => p.ticker).join(', ')}`
    );
  }

  return evaluated;
}
