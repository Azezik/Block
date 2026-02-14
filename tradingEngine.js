export function createTradingEngineState() {
  return {
    log: []
  };
}

export function appendTradeLog(tradingEngine, message) {
  if (!tradingEngine) return;
  if (!Array.isArray(tradingEngine.log)) {
    tradingEngine.log = [];
  }
  tradingEngine.log.push(message);
}

export function logBuy(tradingEngine, crateName, amount) {
  appendTradeLog(tradingEngine, `BUY: ${crateName} - $${Number(amount).toLocaleString()}`);
}

export function logSell(tradingEngine, crateName, amount) {
  appendTradeLog(tradingEngine, `SELL: ${crateName} - $${Number(amount).toLocaleString()}`);
}

export function logPendingSell(tradingEngine, crateName, amount) {
  appendTradeLog(tradingEngine, `Order Pending: SELL: ${crateName} - $${Number(amount).toLocaleString()}`);
}

export function logSold(tradingEngine, crateName, amount) {
  appendTradeLog(tradingEngine, `SOLD: ${crateName} - $${Number(amount).toLocaleString()}`);
}
