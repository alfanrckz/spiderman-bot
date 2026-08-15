import cron from 'node-cron';
import { config } from '../config/env.js';
import { runSwingScan, countActionableSignals } from '../services/scanner.js';
import { evaluateAllPositions } from '../services/positionTracker.js';
import { sendScanResultToChat, sendPositionsSummaryToChat } from '../telegram/bot.js';

export function startScheduledScan() {
  cron.schedule(
    config.cronSchedule,
    async () => {
      console.log('[cron] Menjalankan scan terjadwal...');
      try {
        const result = await runSwingScan();
        await sendScanResultToChat(result);
        console.log(`[cron] Scan selesai. ${countActionableSignals(result)} sinyal ditemukan.`);

        const evaluatedPositions = await evaluateAllPositions();
        await sendPositionsSummaryToChat(evaluatedPositions);
        console.log(`[cron] Evaluasi posisi selesai. ${evaluatedPositions.length} posisi dicek.`);
      } catch (error) {
        console.error('[cron] Gagal menjalankan scan terjadwal:', error);
      }
    },
    { timezone: config.timezone }
  );

  console.log(`[cron] Terjadwal: "${config.cronSchedule}" (${config.timezone})`);
}
