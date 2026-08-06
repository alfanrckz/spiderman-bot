import cron from 'node-cron';
import { config } from '../config/env.js';
import { runSwingScan } from '../services/scanner.js';
import { sendScanResultToChat } from '../telegram/bot.js';

export function startScheduledScan() {
  cron.schedule(
    config.cronSchedule,
    async () => {
      console.log('[cron] Menjalankan scan terjadwal...');
      try {
        const signals = await runSwingScan();
        await sendScanResultToChat(signals);
        console.log(`[cron] Scan selesai. ${signals.length} sinyal ditemukan.`);
      } catch (error) {
        console.error('[cron] Gagal menjalankan scan terjadwal:', error);
      }
    },
    { timezone: config.timezone }
  );

  console.log(`[cron] Terjadwal: "${config.cronSchedule}" (${config.timezone})`);
}
