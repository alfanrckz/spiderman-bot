import { config } from './src/config/env.js';
import { bot } from './src/telegram/bot.js';
import { startScheduledScan } from './src/scheduler/cron.js';
import { startHealthServer } from './src/server/healthServer.js';

async function main() {
  startHealthServer();
  startScheduledScan();
  await bot.launch();
  console.log(`🤖 Bot Swing Trading BEI berjalan (chat tujuan: ${config.chatId}).`);
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

main().catch((error) => {
  console.error('Gagal menjalankan bot:', error);
  process.exit(1);
});
