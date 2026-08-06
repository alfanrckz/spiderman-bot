# Bot Telegram Swing Trading BEI/IDX

Bot Telegram (Node.js/ESM) yang memindai saham likuid di Bursa Efek Indonesia dan mengirim
notifikasi 4 kategori sinyal (Bullish Pullback, Bullish Reversal, Volume Spike, Top Gainers)
untuk swing & intraday trading, berdasarkan data EOD resmi dari Yahoo Finance (EMA 20, EMA 50,
RSI 14, ATR 14). Berjalan otomatis setiap Senin–Jumat pukul 18:30 WIB via `node-cron`, dan bisa
dipicu manual dengan command `/scan`.

## Struktur Proyek

```
.
├── index.js                       # Entry point: launch bot + start cron + health server
├── scripts/scan-and-notify.js     # Script one-off untuk GitHub Actions (scan lalu keluar)
├── src/
│   ├── config/env.js              # Load & validasi .env
│   ├── data/stockUniverse.js      # Universum ticker LQ45/Kompas100 + mid/small cap (.JK)
│   ├── services/
│   │   ├── marketData.js          # Fetch data EOD dari yahoo-finance2
│   │   ├── indicatorEngine.js     # Hitung series EMA20/EMA50/RSI14/ATR14
│   │   ├── tradePlan.js           # Hitung Entry/Take Profit/Stop Loss berbasis ATR
│   │   ├── signalDetector.js      # Filter likuiditas + deteksi semua kategori sinyal
│   │   └── scanner.js             # Orkestrasi scan seluruh universum + ranking top gainers
│   ├── telegram/
│   │   ├── bot.js                 # Instance Telegraf + command /start /scan /help
│   │   └── formatter.js           # Format pesan Markdown per kategori
│   ├── scheduler/cron.js          # Jadwal node-cron Asia/Jakarta
│   ├── server/healthServer.js     # HTTP health-check (untuk Render Web Service)
│   └── utils/concurrencyLimiter.js
├── .github/workflows/scan.yml     # GitHub Actions: scan terjadwal + manual trigger
├── .env.example
├── .gitignore
└── package.json
```

## Logika Sinyal

**Filter likuiditas** dijalankan lebih dulu untuk semua kategori (butuh minimal 100 candle
harian per ticker):
- Close terakhir > Rp 100
- Nilai transaksi harian (Close × Volume) > Rp 3.000.000.000

Setelah lolos likuiditas, tiap ticker dicek terhadap 4 kategori sinyal (satu ticker bisa masuk
lebih dari satu kategori sekaligus):

1. **🟢 Bullish Pullback** (swing) — `Close > EMA20 > EMA50` (uptrend) dan `RSI(14)` di rentang
   `35–48` (koreksi sehat dalam tren naik).
2. **🔄 Bullish Reversal** (swing/intraday) — salah satu dari:
   - **Golden Cross**: `EMA20` baru memotong ke atas `EMA50` hari ini (kemarin masih di bawah),
     dan RSI belum overbought (`< 70`).
   - **RSI Oversold Recovery**: `RSI(14)` kemarin < 30, hari ini rebound ke ≥ 30, dan harga naik
     dari penutupan kemarin.
3. **🚀 Volume Spike** (intraday) — volume hari ini ≥ 2× rata-rata volume 20 hari, harga naik
   ≥ 3% dari penutupan kemarin, dan RSI belum overbought (`< 70`).
4. **🐋 Akumulasi Tersembunyi** (proxy volume, *bukan* bandarmology broker asli) — OBV
   (On-Balance Volume) mencetak rekor tertinggi baru dalam 20 hari terakhir, tapi harga **belum**
   ikut mencetak rekor tertinggi, dan RSI belum overbought. Indikasi volume beli menumpuk lebih
   dulu sebelum harga bergerak. Ini hanya proxy dari data harga & volume publik (Yahoo Finance) —
   bukan analisis broker summary/asing net buy seperti bandarmology yang sesungguhnya, karena
   data itu tidak tersedia gratis.

Guard RSI overbought (`< 70`) di atas sengaja dipasang supaya bot tidak "mengejar" saham yang
sudah naik terlalu jauh di hari yang sama — mengurangi risiko entry di puncak lonjakan harga.

**Entry / Take Profit / Stop Loss** (berbasis ATR(14), berlaku untuk semua kategori di atas):
- Entry = Close terakhir
- Stop Loss = Entry − 1.5 × ATR(14)
- Take Profit = Entry + 2 × risk (risk = Entry − Stop Loss), sehingga Risk:Reward ≈ 1:2

## Setup Lokal

1. Install Node.js 18+.
2. Install dependency:
   ```bash
   npm install
   ```
3. Copy `.env.example` menjadi `.env` dan isi:
   ```
   BOT_TOKEN=token_dari_BotFather
   CHAT_ID=chat_id_tujuan_notifikasi
   ```
4. Jalankan:
   ```bash
   npm start
   ```
5. Uji di Telegram: kirim `/start` lalu `/scan` ke bot Anda.

### Cara mendapatkan `BOT_TOKEN` dan `CHAT_ID`

- **BOT_TOKEN**: chat ke [@BotFather](https://t.me/BotFather) di Telegram → `/newbot` → ikuti
  instruksi → token diberikan setelah bot dibuat.
- **CHAT_ID**:
  1. Kirim pesan apa saja ke bot Anda (atau tambahkan ke grup).
  2. Buka `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` di browser.
  3. Cari field `"chat":{"id": ...}` — itu adalah `CHAT_ID` Anda (untuk grup biasanya berupa
     angka negatif).

## Panduan Deploy Gratis 24/7

Render.com sudah tidak menyediakan instance **Free** untuk tipe **Background Worker** (harus
verifikasi kartu, dan kartu lokal sering ditolak). Railway.app juga cuma menyediakan trial
usage-based yang habis setelah beberapa waktu. Karena itu, opsi utama di panduan ini adalah
**GitHub Actions** — 100% gratis, tanpa kartu, tanpa akun hosting baru.

Ada 2 mode jalan yang didukung proyek ini:

- **Mode terjadwal (GitHub Actions)** — `scripts/scan-and-notify.js` dijalankan sekali oleh
  GitHub Actions setiap Senin-Jumat 18:30 WIB, langsung kirim hasil ke Telegram lalu selesai.
  Tidak ada server yang harus terus menyala. Command `/scan` interaktif digantikan tombol
  **"Run workflow"** di tab Actions GitHub.
- **Mode server 24/7 (`npm start` / `index.js`)** — bot Telegraf long-polling + cron internal +
  health-check server, untuk dijalankan di platform yang benar-benar bisa hidupkan proses terus
  menerus (VPS, Render Web Service, dsb). Command `/scan`, `/start`, `/help` real-time via chat
  hanya berfungsi di mode ini.

### 1. Siapkan Repository GitHub

```bash
git init
git add .
git commit -m "Initial commit: bot swing trading BEI"
```

Pastikan `.gitignore` sudah berisi `.env` dan `node_modules/` (sudah disediakan di proyek ini)
agar token dan dependency tidak ikut ter-commit.

Buat repo baru di GitHub, lalu push:

```bash
git remote add origin https://github.com/<username>/<nama-repo>.git
git branch -M main
git push -u origin main
```

### 2A. GitHub Actions (Recommended — tanpa kartu, tanpa hosting)

1. Buka repo GitHub Anda → **Settings** → **Secrets and variables** → **Actions**.
2. Klik **New repository secret**, tambahkan dua secret:
   - `BOT_TOKEN` = token dari BotFather
   - `CHAT_ID` = chat id tujuan
3. Workflow sudah tersedia di [.github/workflows/scan.yml](.github/workflows/scan.yml), terjadwal
   `30 11 * * 1-5` UTC (= 18:30 WIB, Senin-Jumat).
4. Uji manual: buka tab **Actions** → pilih workflow **Swing Trading Scan** → klik
   **Run workflow** → **Run workflow**. Tunggu selesai, cek Telegram Anda menerima hasil scan.
5. Selesai — tidak perlu langkah lain, tidak ada proses yang perlu tetap menyala.

> Catatan: GitHub menonaktifkan workflow terjadwal secara otomatis jika repo tidak ada aktivitas
> (commit) selama 60 hari. Jika itu terjadi, buka tab Actions dan klik **Enable workflow**.
> Jadwal cron GitHub Actions juga tidak presisi ke detik — bisa meleset beberapa menit saat
> traffic GitHub sedang tinggi.

### 2B. Deploy ke Render.com (Web Service gratis + UptimeRobot anti-sleep)

1. Buat akun di [render.com](https://render.com) dan login dengan GitHub.
2. Klik **New +** → **Web Service**.
3. Pilih repository GitHub bot ini.
4. Isi konfigurasi:
   - **Name**: bebas, misalnya `bot-swing-idx`
   - **Region**: Singapore (paling dekat ke Indonesia)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Di bagian **Environment Variables**, tambahkan:
   - `BOT_TOKEN` = token dari BotFather
   - `CHAT_ID` = chat id tujuan
6. Klik **Create Web Service**. Render akan build & jalankan otomatis, lalu memberi URL publik
   seperti `https://bot-swing-idx.onrender.com`.
7. Cek tab **Logs** — pastikan muncul `🤖 Bot Swing Trading BEI berjalan...` dan
   `[server] Health check server listening on port ...`.
8. **Cegah sleep** dengan [UptimeRobot](https://uptimerobot.com) (gratis):
   - Daftar/login → **Add New Monitor**.
   - **Monitor Type**: HTTP(s)
   - **URL**: URL Render Anda (langkah 6)
   - **Monitoring Interval**: 5 menit (harus < 15 menit agar service tidak sleep)
   - Simpan. Selama UptimeRobot terus ping, service tidak akan sleep sehingga cron 18:30 dan
     `/scan` tetap responsif 24/7.

### 2C. Deploy ke Railway.app (alternatif, trial usage-based)

1. Buat akun di [railway.app](https://railway.app) dan login dengan GitHub.
2. Klik **New Project** → **Deploy from GitHub repo** → pilih repo bot ini.
3. Setelah project terbuat, buka tab **Variables** dan tambahkan:
   - `BOT_TOKEN` = token dari BotFather
   - `CHAT_ID` = chat id tujuan
4. Buka tab **Settings**:
   - **Start Command**: `npm start`
   - Pastikan service ini **bukan** dikonfigurasi sebagai service dengan public networking/port
     (bot tidak butuh port, cukup proses berjalan terus).
5. Railway otomatis build (`npm install`) dan menjalankan `npm start`.
6. Cek tab **Deployments → Logs** untuk memastikan bot aktif.

> Catatan: Railway free tier menggunakan sistem kuota jam/kredit bulanan. Pantau penggunaan di
> dashboard agar bot tidak berhenti karena kuota habis.

### 3. Verifikasi Bot Aktif 24/7

- Kirim `/scan` ke bot dari Telegram — harus dapat balasan meski laptop Anda mati/tertutup.
- Tunggu hingga Senin–Jumat pukul 18:30 WIB untuk memastikan notifikasi otomatis terkirim ke
  `CHAT_ID`.
- Jika ingin mengubah jadwal atau ambang likuiditas tanpa mengubah kode, set environment
  variable tambahan (opsional) di platform hosting: `CRON_SCHEDULE`, `MIN_PRICE`,
  `MIN_TRANSACTION_VALUE`, `HISTORY_DAYS`, `SCAN_CONCURRENCY` (lihat `.env.example`).

## Environment Variables

| Variable | Wajib | Default | Keterangan |
|---|---|---|---|
| `BOT_TOKEN` | ✅ | - | Token bot dari BotFather |
| `CHAT_ID` | ✅ | - | Chat/grup tujuan notifikasi otomatis |
| `CRON_SCHEDULE` | ❌ | `30 18 * * 1-5` | Format cron, default Senin-Jumat 18:30 |
| `TZ_NAME` | ❌ | `Asia/Jakarta` | Timezone cron |
| `MIN_PRICE` | ❌ | `100` | Ambang harga minimum (Rp) |
| `MIN_TRANSACTION_VALUE` | ❌ | `3000000000` | Ambang nilai transaksi harian minimum (Rp) |
| `HISTORY_DAYS` | ❌ | `200` | Rentang hari kalender data historis yang diambil |
| `SCAN_CONCURRENCY` | ❌ | `5` | Jumlah request paralel ke Yahoo Finance saat scan |
| `VOLUME_SPIKE_RATIO` | ❌ | `2` | Ambang rasio volume hari ini vs rata-rata 20 hari |
| `VOLUME_SPIKE_MIN_GAIN_PCT` | ❌ | `3` | Ambang minimum kenaikan harga (%) untuk kategori Volume Spike |
| `RSI_OVERSOLD_THRESHOLD` | ❌ | `30` | Ambang RSI oversold untuk deteksi Bullish Reversal |
| `RSI_OVERBOUGHT_THRESHOLD` | ❌ | `70` | Ambang RSI overbought — di atas ini, Reversal & Volume Spike diabaikan |

## Command Telegram

- `/start` — cek bot aktif.
- `/scan` — jalankan pemindaian manual ke seluruh universum saham (4 kategori sinyal) dan kirim hasilnya.
- `/help` — tampilkan daftar command.
