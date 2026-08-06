import YahooFinance from 'yahoo-finance2';
import { config } from '../config/env.js';

const yahooFinance = new YahooFinance();

export async function fetchDailyHistory(ticker) {
  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period1.getDate() - config.historyDays);

  const result = await yahooFinance.chart(ticker, {
    period1,
    period2,
    interval: '1d',
  });

  return (result.quotes || []).filter(
    (quote) => quote.close != null && quote.volume != null
  );
}
