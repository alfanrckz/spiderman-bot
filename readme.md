# Bot Telegram Swing Trading BEI/IDX

Bot Telegram (Node.js/ESM) yang memindai (hampir) seluruh saham tercatat di Bursa Efek Indonesia
dan mengirim notifikasi 4 kategori sinyal (Bullish Pullback, Bullish Reversal, Volume Spike,
Akumulasi Tersembunyi) untuk swing & intraday trading, berdasarkan data EOD resmi dari Yahoo
Finance (EMA 20, EMA 50, RSI 14, ATR 14, OBV). Berjalan otomatis setiap Senin–Jumat pukul 18:30
WIB via `node-cron`, bisa dipicu manual dengan command `/scan`, dan bisa melacak status posisi
Anda sendiri lewat `/entry`, `/posisi`, `/close`.

## Struktur Proyek

```
.
├── index.js                       # Entry point: launch bot + start cron + health server
├── scripts/
│   ├── scan-and-notify.js         # Script one-off untuk GitHub Actions (scan + evaluasi posisi)
│   └── fetch-idx-universe.js      # Refresh daftar ticker dari dataset publik IDX
├── src/
│   ├── config/env.js              # Load & validasi .env
│   ├── data/
│   │   ├── stockUniverse.js       # Baca idxUniverse.json, tambahkan suffix .JK
│   │   ├── idxUniverse.json       # Hasil generate fetch-idx-universe.js (jangan edit manual)
│   │   └── positions.json         # State posisi yang dilacak via /entry (auto commit ke git)
│   ├── services/
│   │   ├── marketData.js          # Fetch data EOD dari yahoo-finance2
│   │   ├── indicatorEngine.js     # Hitung series EMA20/EMA50/RSI14/ATR14/OBV
│   │   ├── marketCondition.js     # Cek tren IHSG sekali per scan (gate "jangan lawan pasar")
│   │   ├── tradePlan.js           # Hitung Entry/Take Profit/Stop Loss berbasis ATR
│   │   ├── signalDetector.js      # Filter likuiditas + deteksi semua kategori sinyal
│   │   ├── scanner.js             # Orkestrasi scan seluruh universum
│   │   └── positionTracker.js     # /entry /close + evaluasi status posisi (HOLD/TP/SL/invalid)
│   ├── telegram/
│   │   ├── bot.js                 # Instance Telegraf + command /start /scan /entry /posisi /close /help
│   │   └── formatter.js           # Format pesan Markdown per kategori & status posisi
│   ├── scheduler/cron.js          # Jadwal node-cron Asia/Jakarta
│   ├── server/healthServer.js     # HTTP health-check (untuk Render Web Service)
│   └── utils/
│       ├── concurrencyLimiter.js
│       └── gitSync.js             # Commit+push otomatis positions.json (git sebagai "database")
├── .github/workflows/scan.yml     # GitHub Actions: scan terjadwal + manual trigger
├── .env.example
├── .gitignore
└── package.json
```

## Universum Saham

`src/data/idxUniverse.json` digenerate oleh `npm run fetch-universe` dari dataset publik
[wildangunawan/Dataset-Saham-IDX](https://github.com/wildangunawan/Dataset-Saham-IDX) (lisensi
CC BY-NC 4.0, data bersumber dari PT Bursa Efek Indonesia — **hanya untuk penggunaan
non-komersial**, wajib cantumkan atribusi ini). Saham di papan **"Pemantauan Khusus"**
(klasifikasi resmi IDX untuk emiten dengan pola transaksi tidak wajar / risiko tinggi) otomatis
dikecualikan sebelum masuk universum scan.

Kenapa bukan fetch langsung dari idx.co.id? Situsnya dilindungi Cloudflare bot-protection —
request otomatis (termasuk dari Node.js) diblokir dengan challenge page, kecuali dengan teknik
bypass yang secara sengaja tidak diimplementasikan di proyek ini.

Jalankan `npm run fetch-universe` sewaktu-waktu (misal tiap 1-2 bulan) untuk memperbarui daftar
ticker mengikuti IPO/delisting terbaru — dataset sumbernya di-update manual oleh maintainer-nya,
jadi tidak selalu 100% real-time, tapi jauh lebih lengkap (700+ ticker) dibanding daftar manual.

Setelah universum di-generate, **filter likuiditas & indikator di `signalDetector.js` tetap jadi
penyaring utama** — memperluas universum tidak mengubah kriteria sinyal, cuma memperluas
cakupan saham yang diperiksa.

## Logika Sinyal

**Filter kondisi pasar** dicek sekali per scan, sebelum ticker mana pun dianalisis — "jangan
melawan arus pasar": IHSG (`^JKSE`) harus `Close > EMA20 > EMA50` (bullish) supaya sinyal beli
apa pun boleh muncul. Kalau IHSG sendiri sedang downtrend/netral, semua kategori sinyal
otomatis kosong hari itu — bukan bug, itu memang tujuannya (skip total daripada kasih sinyal
saat probabilitas keberhasilannya rendah karena melawan tren market secara keseluruhan).

**Filter likuiditas** dijalankan berikutnya untuk semua kategori (butuh minimal 100 candle
harian per ticker):
- Close terakhir > Rp 100
- Nilai transaksi harian (Close × Volume) > Rp 3.000.000.000

Setelah lolos likuiditas & kondisi pasar bullish, tiap ticker dicek terhadap 4 kategori sinyal
(satu ticker bisa masuk lebih dari satu kategori sekaligus):

1. **🟢 Bullish Pullback** (swing) — `Close > EMA20 > EMA50` (uptrend) dan `RSI(14)` di rentang
   `35–48` (koreksi sehat dalam tren naik). EMA50 juga wajib masih naik dibanding ~10 hari
   (2 minggu) lalu — mencegah kasus `EMA20 > EMA50` yang terjadi padahal EMA50-nya sendiri sudah
   mendatar/melandai (tren melemah, bukan tren naik yang benar-benar sehat).
2. **🔄 Bullish Reversal** (swing/intraday) — salah satu dari:
   - **Golden Cross**: `EMA20` baru memotong ke atas `EMA50` hari ini (kemarin masih di bawah),
     dan RSI belum overbought (`< 70`).
   - **RSI Oversold Recovery**: `RSI(14)` kemarin < 30, hari ini rebound ke ≥ 30, dan harga naik
     dari penutupan kemarin.
3. **🚀 Volume Spike** (intraday) — volume hari ini ≥ 2× rata-rata volume 20 hari, harga naik
   ≥ 3% dari penutupan kemarin, RSI belum overbought (`< 70`), **dan candle-nya "closed strong"**
   — Close berada di ≥50% bagian atas range hari itu (`(Close-Low)/(High-Low) ≥ 0.5`). Tanpa ini,
   saham yang sempat naik tinggi lalu dijual turun sampai closing (spike-and-fade, tanda lemah)
   ikut lolos padahal buyer sudah kehilangan kendali di akhir sesi.
   **Entry yang disarankan bukan harga penutupan hari spike** (itu harga paling euforia/mahal
   hari itu, entry di situ = chasing dan sering langsung dikoreksi besoknya) — melainkan area
   retracement ke **EMA20**, dengan SL/TP dihitung ulang dari level itu. Kalau harga tidak pernah
   retest ke area tersebut, sinyalnya dilewati saja, bukan dipaksakan entry di harga tinggi.
4. **🐋 Akumulasi Tersembunyi** (proxy volume, *bukan* bandarmology broker asli) — OBV
   (On-Balance Volume) mencetak rekor tertinggi baru dalam 20 hari terakhir, tapi harga **belum**
   ikut mencetak rekor tertinggi, RSI belum overbought, **dan** nilai transaksi **hari ini** *serta*
   rata-rata 20 hari sama-sama ≥ Rp 10 Miliar (jauh di atas ambang likuiditas dasar). Indikasi
   volume beli menumpuk lebih dulu sebelum harga bergerak. Ini hanya proxy dari data harga &
   volume publik (Yahoo Finance) — bukan analisis broker summary/asing net buy seperti
   bandarmology yang sesungguhnya, karena data itu tidak tersedia gratis.

Guard RSI overbought (`< 70`) di atas sengaja dipasang supaya bot tidak "mengejar" saham yang
sudah naik terlalu jauh di hari yang sama — mengurangi risiko entry di puncak lonjakan harga.

> Catatan khusus kategori Akumulasi Tersembunyi: OBV gampang terpicu oleh saham tidak likuid —
> satu transaksi besar di saham tipis bisa membuat OBV mencetak "rekor baru" padahal cuma noise,
> bukan akumulasi sungguhan. Rata-rata 20 hari saja tidak cukup — rata-rata bisa terdongkrak
> beberapa hari ramai padahal hari sinyal itu sendiri (hari yang mau di-entry) sepi. Karena itu
> nilai transaksi hari ini **dan** rata-rata 20 hari harus sama-sama lolos ambang. Ini tetap
> proxy kasar — Yahoo Finance tidak menyediakan data kedalaman order book (bid-ask depth) asli,
> jadi nilai transaksi besar tidak 100% menjamin order book-nya ramai.

**Entry / Take Profit / Stop Loss** (berbasis ATR(14), berlaku untuk semua kategori di atas):
- Entry = Close terakhir
- Stop Loss = Entry − 1.5 × ATR(14)
- Take Profit = Entry + 2 × risk (risk = Entry − Stop Loss), sehingga Risk:Reward ≈ 1:2

## Pelacakan Posisi (/entry, /posisi, /close)

Bot ini stateless secara desain — tanpa Anda beri tahu, dia tidak tahu saham apa yang benar-benar
Anda beli. Fitur ini menambahkan lapisan pelacakan posisi manual:

1. **`/entry TICKER [harga]`** — setelah Anda benar-benar beli, beri tahu bot. Harga opsional
   (default pakai Close terakhir); isi manual kalau harga beli Anda beda (mis. `/entry SMRA 335`).
2. **`/posisi`** — cek status semua posisi yang dilacak, kapan saja. Statusnya:
   - 🟢/🟡 **HOLD** — masih sesuai rencana, belum ada alasan keluar.
   - ✅ **TAKE PROFIT HIT** — harga sudah capai TP, otomatis dihapus dari daftar.
   - 🛑 **STOP LOSS HIT** — harga sudah tembus SL, otomatis dihapus dari daftar.
   - ⚠️ **REKOMENDASI KELUAR** — tesis awal sinyal sudah rusak meski SL/TP belum kena (mis. tren
     balik turun di bawah EMA50/EMA20, atau dead cross EMA20/EMA50). Ini rekomendasi, bukan
     otomatis — posisi tetap ada di daftar sampai Anda `/close` manual.
3. **`/close TICKER`** — berhenti melacak (dipakai setelah Anda benar-benar jual/keluar).

Status posisi juga otomatis dikirim bersamaan dengan hasil `/scan` dan scan terjadwal 18:30 WIB
(kalau ada posisi yang dilacak).

**Bagaimana state-nya tersimpan:** `src/data/positions.json` di-commit & push otomatis ke
repository setiap ada perubahan (git dipakai sebagai "database" gratis, tanpa perlu layanan
database terpisah). Konsekuensinya:
- `/entry`, `/close`, dan `/posisi` **hanya berfungsi selagi bot interaktif (`npm start` /
  `index.js`) sedang berjalan** — mode GitHub Actions terjadwal cuma bisa mengevaluasi &
  menghapus posisi otomatis (TP/SL hit), tidak bisa menerima command baru dari Anda.
- Proses yang menjalankan `index.js` butuh akses git push ke repo ini (kredensial & identity git
  sudah otomatis tersedia kalau dijalankan di komputer/VPS yang sama dengan tempat Anda develop).
- Kalau commit/push gagal (mis. tidak ada koneksi/kredensial), perubahan tetap tersimpan lokal
  dan bot tidak crash — cuma tidak ter-sinkron ke repo sampai push berikutnya berhasil.

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
| `HIDDEN_ACCUMULATION_MIN_AVG_VALUE` | ❌ | `10000000000` | Ambang rata-rata nilai transaksi 20 hari khusus kategori Akumulasi Tersembunyi (Rp) |
| `VOLUME_SPIKE_MIN_CLOSE_STRENGTH` | ❌ | `0.5` | Minimum posisi Close dalam range High-Low hari itu (0-1) untuk kategori Volume Spike |

## Command Telegram

- `/start` — cek bot aktif.
- `/scan` — jalankan pemindaian manual ke seluruh universum saham (4 kategori sinyal) dan kirim hasilnya.
- `/entry TICKER [harga]` — mulai lacak posisi (lihat [Pelacakan Posisi](#pelacakan-posisi-entry-posisi-close)).
- `/posisi` — cek status semua posisi yang dilacak.
- `/close TICKER` — berhenti melacak posisi.
- `/help` — tampilkan daftar command.
