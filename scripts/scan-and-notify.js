import { runSwingScan, countActionableSignals } from '../src/services/scanner.js';
import { sendScanResultToChat } from '../src/telegram/bot.js';

async function main() {
  console.log('[scan] Menjalankan pemindaian saham likuid BEI...');
  const result = await runSwingScan();
  await sendScanResultToChat(result);
  console.log(`[scan] Selesai. ${countActionableSignals(result)} sinyal ditemukan & terkirim ke Telegram.`);
}

main().catch((error) => {
  console.error('[scan] Gagal menjalankan pemindaian:', error);
  process.exit(1);
});
