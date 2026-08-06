import { Telegraf } from 'telegraf';
import { config } from '../config/env.js';
import { runSwingScan } from '../services/scanner.js';
import { formatScanSummary } from './formatter.js';

export const bot = new Telegraf(config.botToken);

const HELP_MESSAGE = [
  '🤖 *Bot Swing Trading BEI*',
  '',
  'Daftar command yang tersedia:',
  '/start — cek bot aktif',
  '/scan — pindai seluruh universum saham secara manual dan kirim sinyal beli',
  '/help — tampilkan pesan ini',
  '',
  'Bot juga otomatis memindai dan mengirim sinyal setiap Senin–Jumat pukul 18:30 WIB.',
].join('\n');

bot.command('start', (ctx) => {
  ctx.reply(
    '👋 Bot Swing Trading BEI aktif.\nGunakan /scan untuk memindai sinyal secara manual, atau /help untuk daftar command.'
  );
});

bot.command('help', (ctx) => {
  ctx.replyWithMarkdown(HELP_MESSAGE);
});

bot.command('scan', async (ctx) => {
  await ctx.reply('⏳ Memindai saham likuid BEI, mohon tunggu...');

  try {
    const signals = await runSwingScan();
    const messages = formatScanSummary(signals);

    for (const message of messages) {
      await ctx.replyWithMarkdown(message);
    }
  } catch (error) {
    console.error('[bot] Gagal menjalankan /scan:', error);
    await ctx.reply('⚠️ Terjadi kesalahan saat memindai saham. Coba lagi nanti.');
  }
});

export async function sendScanResultToChat(signals) {
  const messages = formatScanSummary(signals);

  for (const message of messages) {
    await bot.telegram.sendMessage(config.chatId, message, { parse_mode: 'Markdown' });
  }
}
