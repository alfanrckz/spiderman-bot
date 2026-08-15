import { Telegraf } from 'telegraf';
import { config } from '../config/env.js';
import { runSwingScan } from '../services/scanner.js';
import { addPosition, removePosition, evaluateAllPositions } from '../services/positionTracker.js';
import { formatScanSummary, formatPositionsSummary } from './formatter.js';

export const bot = new Telegraf(config.botToken);

const HELP_MESSAGE = [
  '🤖 *Bot Swing Trading BEI*',
  '',
  'Daftar command yang tersedia:',
  '/start — cek bot aktif',
  '/scan — pindai seluruh universum saham secara manual dan kirim sinyal beli',
  '/entry TICKER [harga] — mulai lacak posisi (harga opsional, default harga penutupan terakhir)',
  '/posisi — lihat status semua posisi yang sedang dilacak',
  '/close TICKER — berhenti melacak posisi (setelah Anda benar-benar keluar)',
  '/help — tampilkan pesan ini',
  '',
  'Bot juga otomatis memindai dan mengirim sinyal + status posisi setiap Senin–Jumat 18:30 WIB.',
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
    const result = await runSwingScan();
    const messages = formatScanSummary(result);

    for (const message of messages) {
      await ctx.replyWithMarkdown(message);
    }
  } catch (error) {
    console.error('[bot] Gagal menjalankan /scan:', error);
    await ctx.reply('⚠️ Terjadi kesalahan saat memindai saham. Coba lagi nanti.');
  }
});

bot.command('entry', async (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1);
  const [tickerArg, priceArg] = args;

  if (!tickerArg) {
    await ctx.reply('Format: /entry TICKER [harga]\nContoh: /entry SMRA atau /entry SMRA 335');
    return;
  }

  const customPrice = priceArg ? Number(priceArg) : undefined;
  if (priceArg && (Number.isNaN(customPrice) || customPrice <= 0)) {
    await ctx.reply('Harga tidak valid. Contoh: /entry SMRA 335');
    return;
  }

  await ctx.reply(`⏳ Menambahkan posisi #${tickerArg.toUpperCase()}...`);

  try {
    const position = await addPosition(tickerArg, customPrice);
    await ctx.replyWithMarkdown(
      [
        `✅ Posisi #${position.ticker.replace('.JK', '')} mulai dilacak.`,
        `Entry: Rp ${position.entry} | SL: Rp ${Math.round(position.stopLoss)} | TP: Rp ${Math.round(position.takeProfit)}`,
        `Gunakan /posisi untuk cek status kapan saja.`,
      ].join('\n')
    );
  } catch (error) {
    console.error('[bot] Gagal /entry:', error);
    await ctx.reply(`⚠️ ${error.message}`);
  }
});

bot.command('close', async (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1);
  const [tickerArg] = args;

  if (!tickerArg) {
    await ctx.reply('Format: /close TICKER\nContoh: /close SMRA');
    return;
  }

  try {
    const ticker = await removePosition(tickerArg);
    await ctx.reply(`✅ Posisi #${ticker.replace('.JK', '')} sudah berhenti dilacak.`);
  } catch (error) {
    console.error('[bot] Gagal /close:', error);
    await ctx.reply(`⚠️ ${error.message}`);
  }
});

bot.command('posisi', async (ctx) => {
  await ctx.reply('⏳ Mengecek status posisi...');

  try {
    const evaluated = await evaluateAllPositions();
    const messages = formatPositionsSummary(evaluated);

    for (const message of messages) {
      await ctx.replyWithMarkdown(message);
    }
  } catch (error) {
    console.error('[bot] Gagal /posisi:', error);
    await ctx.reply('⚠️ Terjadi kesalahan saat mengecek posisi.');
  }
});

export async function sendScanResultToChat(result) {
  const messages = formatScanSummary(result);

  for (const message of messages) {
    await bot.telegram.sendMessage(config.chatId, message, { parse_mode: 'Markdown' });
  }
}

export async function sendPositionsSummaryToChat(evaluatedPositions) {
  if (evaluatedPositions.length === 0) {
    return;
  }

  const messages = formatPositionsSummary(evaluatedPositions);

  for (const message of messages) {
    await bot.telegram.sendMessage(config.chatId, message, { parse_mode: 'Markdown' });
  }
}
