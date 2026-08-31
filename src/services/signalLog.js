import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config/env.js';
import { fetchDailyHistory } from './marketData.js';
import { mapWithConcurrency } from '../utils/concurrencyLimiter.js';
import { commitAndPush } from '../utils/gitSync.js';

const SIGNAL_LOG_RELATIVE_PATH = path.join('src', 'data', 'signalLog.json');
const SIGNAL_LOG_ABSOLUTE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'signalLog.json'
);

// Yahoo Finance mengembalikan `date` sebagai objek Date, tapi setelah ditulis ke JSON dan dibaca
// ulang jadi string. Normalisasi ke "YYYY-MM-DD" di titik masuk supaya semua perbandingan tanggal
// (dedupe id, urutan candle sejak sinyal, pruning) konsisten sebagai perbandingan string, tidak
// pernah membandingkan Date mentah dengan string (rawan salah, lihat Date vs string coercion).
function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function loadSignalLog() {
  const raw = readFileSync(SIGNAL_LOG_ABSOLUTE_PATH, 'utf-8');
  return JSON.parse(raw);
}

function saveSignalLog(log) {
  writeFileSync(SIGNAL_LOG_ABSOLUTE_PATH, JSON.stringify(log, null, 2) + '\n', 'utf-8');
}

async function saveSignalLogAndSync(log, commitMessage) {
  saveSignalLog(log);
  await commitAndPush(SIGNAL_LOG_RELATIVE_PATH, commitMessage);
}

function makeEmptyOutcomes() {
  return Object.fromEntries(config.signalLogOutcomeHorizonsDays.map((days) => [`d${days}`, null]));
}

function entryPriceFor(category, signal) {
  return category === 'volumeSpike' ? signal.volumeSpikeEntry ?? signal.entry : signal.entry;
}

// Meratakan hasil runSwingScan() jadi satu record per sinyal per kategori, lalu tambahkan ke
// signalLog.json (dedupe by id supaya /scan manual berkali-kali sehari tidak dobel-log). Ini
// enabler evaluasi win-rate berbasis data nyata — bukan skor tervalidasi, cuma pencatatan mentah
// yang nanti dievaluasi oleh updateSignalLogOutcomes().
export async function recordSignalEntries(scanResult) {
  const log = loadSignalLog();
  const existingIds = new Set(log.map((entry) => entry.id));
  let added = 0;

  for (const category of Object.keys(scanResult)) {
    for (const signal of scanResult[category]) {
      const dateKey = toDateKey(signal.date);
      const id = `${signal.ticker}-${category}-${dateKey}`;
      if (existingIds.has(id)) continue;

      const entryRef = entryPriceFor(category, signal);
      if (entryRef == null) continue;

      log.push({
        id,
        ticker: signal.ticker,
        category,
        date: dateKey,
        entryRef,
        confidence: signal.confidence,
        confidenceMax: signal.confidenceMax,
        outcomes: makeEmptyOutcomes(),
      });
      existingIds.add(id);
      added++;
    }
  }

  if (added > 0) {
    await saveSignalLogAndSync(log, `chore: catat ${added} sinyal baru ke signal log`);
  }
}

function isUnresolved(entry) {
  return Object.values(entry.outcomes).some((value) => value == null);
}

// Untuk tiap record yang masih ada slot outcome kosong, fetch history ticker-nya dan isi slot
// horizon (D+1/D+3/D+5, dsb — lihat SIGNAL_LOG_OUTCOME_HORIZONS_DAYS) yang candle-nya sudah
// tersedia sejak tanggal sinyal dicatat.
export async function updateSignalLogOutcomes() {
  const log = loadSignalLog();
  const unresolvedTickers = [...new Set(log.filter(isUnresolved).map((entry) => entry.ticker))];

  if (unresolvedTickers.length === 0) {
    return;
  }

  const historyByTicker = new Map();
  await mapWithConcurrency(unresolvedTickers, config.scanConcurrency, async (ticker) => {
    try {
      historyByTicker.set(ticker, await fetchDailyHistory(ticker));
    } catch (error) {
      console.error(`[signalLog] Gagal fetch history ${ticker}:`, error.message);
    }
  });

  let updated = false;

  for (const entry of log) {
    if (!isUnresolved(entry)) continue;

    const history = historyByTicker.get(entry.ticker);
    if (!history) continue;

    const candlesSinceSignal = history.filter((candle) => toDateKey(candle.date) > entry.date);

    for (const days of config.signalLogOutcomeHorizonsDays) {
      const key = `d${days}`;
      if (entry.outcomes[key] != null) continue;
      if (candlesSinceSignal.length < days) continue;

      const candle = candlesSinceSignal[days - 1];
      entry.outcomes[key] = {
        closePrice: candle.close,
        pctChange: ((candle.close - entry.entryRef) / entry.entryRef) * 100,
        checkedDate: toDateKey(candle.date),
      };
      updated = true;
    }
  }

  const resolvedEntries = log.filter((entry) => !isUnresolved(entry));
  let prunedLog = log;
  if (log.length > config.signalLogMaxEntries && resolvedEntries.length > 0) {
    const overflow = log.length - config.signalLogMaxEntries;
    const idsToRemove = new Set(
      resolvedEntries
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, overflow)
        .map((entry) => entry.id)
    );
    prunedLog = log.filter((entry) => !idsToRemove.has(entry.id));
    updated = true;
  }

  if (updated) {
    await saveSignalLogAndSync(prunedLog, 'chore: update outcome signal log');
  }
}
