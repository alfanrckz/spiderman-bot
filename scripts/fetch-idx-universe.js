import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Sumber: dataset publik "Dataset-Saham-IDX" oleh wildangunawan di GitHub, berisi snapshot
// resmi daftar emiten BEI (kode, nama, tanggal listing, papan pencatatan).
// https://github.com/wildangunawan/Dataset-Saham-IDX — lisensi CC BY-NC 4.0 (non-komersial),
// data bersumber dari PT Bursa Efek Indonesia. Wajib dicantumkan atribusi ini saat dipakai.
const DATASET_CSV_URL =
  'https://raw.githubusercontent.com/wildangunawan/Dataset-Saham-IDX/master/List%20Emiten/all.csv';

// Papan "Pemantauan Khusus" adalah klasifikasi resmi IDX untuk emiten dengan pola transaksi
// tidak wajar / risiko tinggi (rawan gorengan) — dikecualikan dari universum scan.
const EXCLUDED_BOARDS = new Set(['Pemantauan Khusus']);

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',');
  const codeIndex = header.indexOf('code');
  const boardIndex = header.indexOf('listingBoard');

  return lines.slice(1).map((line) => {
    const columns = line.split(',');
    return { code: columns[codeIndex], board: columns[boardIndex] };
  });
}

async function fetchIdxCompanies() {
  const response = await fetch(DATASET_CSV_URL);

  if (!response.ok) {
    throw new Error(`Gagal fetch dataset emiten IDX: HTTP ${response.status}`);
  }

  const csvText = await response.text();
  return parseCsv(csvText);
}

async function main() {
  console.log('[fetch-universe] Mengambil dataset emiten BEI dari GitHub (wildangunawan/Dataset-Saham-IDX)...');
  const companies = await fetchIdxCompanies();
  console.log(`[fetch-universe] Total emiten diterima: ${companies.length}`);

  const boardCounts = {};
  for (const row of companies) {
    boardCounts[row.board] = (boardCounts[row.board] || 0) + 1;
  }
  console.log('[fetch-universe] Distribusi papan pencatatan:', boardCounts);

  const tickers = companies
    .filter((row) => !EXCLUDED_BOARDS.has(row.board))
    .map((row) => row.code?.trim().toUpperCase())
    .filter(Boolean)
    .sort();

  console.log(`[fetch-universe] Dikecualikan (Pemantauan Khusus): ${companies.length - tickers.length}`);
  console.log(`[fetch-universe] Total ticker final: ${tickers.length}`);

  const outputPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'data',
    'idxUniverse.json'
  );

  writeFileSync(outputPath, JSON.stringify(tickers, null, 2) + '\n', 'utf-8');
  console.log(`[fetch-universe] Tersimpan ke ${outputPath}`);
}

main().catch((error) => {
  console.error('[fetch-universe] Gagal:', error);
  process.exit(1);
});
