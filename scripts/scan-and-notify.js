import { runSwingScan, countActionableSignals } from '../src/services/scanner.js';
import { evaluateAllPositions } from '../src/services/positionTracker.js';
import { sendScanResultToChat, sendPositionsSummaryToChat } from '../src/telegram/bot.js';

async function main() {
  console.log('[scan] Menjalankan pemindaian saham likuid BEI...');
  const result = await runSwingScan();
  await sendScanResultToChat(result);
  console.log(`[scan] Selesai. ${countActionableSignals(result)} sinyal ditemukan & terkirim ke Telegram.`);

  const evaluatedPositions = await evaluateAllPositions();
  await sendPositionsSummaryToChat(evaluatedPositions);
  console.log(`[scan] Evaluasi posisi selesai. ${evaluatedPositions.length} posisi dicek.`);
}

main().catch((error) => {
  console.error('[scan] Gagal menjalankan pemindaian:', error);
  process.exit(1);
});
