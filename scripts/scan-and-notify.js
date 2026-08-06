import { runSwingScan } from '../src/services/scanner.js';
import { sendScanResultToChat } from '../src/telegram/bot.js';

async function main() {
  console.log('[scan] Menjalankan pemindaian saham likuid BEI...');
  const signals = await runSwingScan();
  await sendScanResultToChat(signals);
  console.log(`[scan] Selesai. ${signals.length} sinyal ditemukan & terkirim ke Telegram.`);
}

main().catch((error) => {
  console.error('[scan] Gagal menjalankan pemindaian:', error);
  process.exit(1);
});
