import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Daftar ticker digenerate oleh scripts/fetch-idx-universe.js dari dataset publik
// wildangunawan/Dataset-Saham-IDX (https://github.com/wildangunawan/Dataset-Saham-IDX,
// CC BY-NC 4.0, data bersumber dari PT Bursa Efek Indonesia). Sudah dikecualikan saham
// papan "Pemantauan Khusus" (klasifikasi resmi IDX untuk emiten berisiko tinggi/rawan
// gorengan). Filter likuiditas & indikator di signalDetector.js tetap jadi penyaring utama
// saat scan — jalankan `npm run fetch-universe` sewaktu-waktu untuk refresh daftar ini.
const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'idxUniverse.json');
const tickerCodes = JSON.parse(readFileSync(dataPath, 'utf-8'));

export const STOCK_UNIVERSE = tickerCodes.map((code) => `${code}.JK`);
