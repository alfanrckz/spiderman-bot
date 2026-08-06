// Universum saham likuid BEI: gabungan konstituen LQ45 & Kompas100 (kode tanpa suffix).
// Filter likuiditas (harga & nilai transaksi) tetap dijalankan saat scan, jadi daftar ini
// sengaja dibuat luas agar peluang sinyal tidak terlewat.
const TICKER_CODES = [
  // Perbankan & Keuangan
  'BBCA', 'BBRI', 'BMRI', 'BBNI', 'BRIS', 'BNGA', 'BNLI', 'PNBN', 'NISP', 'BBTN',
  'ARTO', 'BFIN', 'ADMF', 'BTPS', 'AMAR',
  // Telekomunikasi & Menara
  'TLKM', 'EXCL', 'ISAT', 'TOWR', 'TBIG', 'MTEL',
  // Consumer & Ritel
  'ASII', 'UNTR', 'HMSP', 'GGRM', 'ICBP', 'INDF', 'MYOR', 'UNVR', 'KLBF', 'SIDO',
  'CPIN', 'JPFA', 'MAIN', 'AMRT', 'MPPA', 'HERO', 'ACES', 'ERAA', 'MAPI', 'LPPF',
  'RALS', 'ULTJ', 'STTP', 'ROTI',
  // Pertambangan & Energi
  'ANTM', 'INCO', 'MDKA', 'TINS', 'PTBA', 'ADRO', 'ITMG', 'INDY', 'HRUM', 'BUMI',
  'MEDC', 'PGAS', 'AKRA', 'ELSA', 'BRMS', 'DEWA', 'MBAP', 'ESSA',
  // Semen, Konstruksi & Properti
  'SMGR', 'INTP', 'WIKA', 'WSKT', 'PTPP', 'ADHI', 'JSMR', 'BSDE', 'CTRA', 'PWON',
  'SMRA', 'ASRI', 'APLN', 'PANI',
  // Kimia & Petrokimia
  'UNIC', 'TPIA', 'BRPT', 'AVIA', 'INKP', 'TKIM', 'SMBR',
  // Teknologi & Media
  'GOTO', 'BUKA', 'EMTK', 'MTDL', 'DMAS', 'WIFI', 'SCMA', 'MNCN', 'MDIA', 'JTPE',
  // Kesehatan
  'KAEF', 'PEHA', 'SILO', 'MIKA', 'HEAL',
  // Infrastruktur & lainnya
  'CMNP', 'TOTL', 'META', 'CSAP', 'ITMA', 'HRTA', 'MARK',
  // Agrikultur
  'AALI', 'LSIP', 'SIMP', 'SMAR', 'DSNG', 'TAPG',

  // --- Mid Cap & Small Cap (di luar inti LQ45/Kompas100) ---
  // Properti & Konstruksi
  'BEST', 'KIJA', 'MTLA', 'LPKR', 'DUTI', 'GPRA', 'RDTX', 'NRCA', 'WTON', 'PBSA',
  // Consumer & Ritel
  'KINO', 'HOKI', 'CAMP', 'CLEO', 'DLTA', 'GOOD', 'TCID', 'MIDI', 'RANC',
  // Basic Material & Industri
  'ARNA', 'IMPC', 'SRSN', 'ALKA', 'INCI', 'ISSP', 'KDSI', 'GJTL', 'AUTO', 'SMSM',
  'IMAS', 'BOLT', 'DRMA',
  // Pertambangan & Energi
  'DOID', 'TOBA', 'GEMS', 'KKGI', 'ABMM', 'BSSR', 'PSAB', 'RAJA', 'TGRA', 'POWR',
  // Perbankan & Keuangan kecil-menengah
  'BJBR', 'BJTM', 'BACA', 'AGRO', 'BBSI', 'MAYA',
  // Agrikultur
  'SGRO', 'TBLA', 'ANJT', 'BWPT',
];

export const STOCK_UNIVERSE = TICKER_CODES.map((code) => `${code}.JK`);
