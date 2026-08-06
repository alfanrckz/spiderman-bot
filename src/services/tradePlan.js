const ATR_STOP_MULTIPLIER = 1.5;
const RISK_REWARD_RATIO = 2; // TP = Entry + RISK_REWARD_RATIO x risk (risk = Entry - SL)

export function buildTradePlan(entry, atr14) {
  const risk = ATR_STOP_MULTIPLIER * atr14;

  return {
    entry,
    stopLoss: entry - risk,
    takeProfit: entry + RISK_REWARD_RATIO * risk,
  };
}
