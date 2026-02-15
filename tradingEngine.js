function formatMoney(amount) {
  return `$${Number(amount || 0).toLocaleString()}`;
}

function makeLogMessage(event) {
  const crateName = event.crateName || event.investmentId || 'UNKNOWN';
  if (event.type === 'BUY') return `BUY: ${crateName} - ${formatMoney(event.amount)}`;
  if (event.type === 'SELL') return `SELL: ${crateName} - ${formatMoney(event.amount)}`;
  if (event.type === 'TRANSFER') return `TRANSFER: ${crateName} - ${formatMoney(event.amount)}`;
  if (event.type === 'ADJUST') return `ADJUST: ${crateName} - ${formatMoney(event.amount)}`;
  return `${event.type}: ${crateName} - ${formatMoney(event.amount)}`;
}

export function createTradingEngineState() {
  return {
    log: [],
    events: []
  };
}

export function appendTradeEvent(tradingEngine, event) {
  if (!tradingEngine || !event) return;
  if (!Array.isArray(tradingEngine.log)) tradingEngine.log = [];
  if (!Array.isArray(tradingEngine.events)) tradingEngine.events = [];

  const normalized = {
    ts: event.ts || Date.now(),
    type: event.type || 'UNKNOWN',
    investmentId: event.investmentId || null,
    crateName: event.crateName || 'UNKNOWN',
    amount: Number(event.amount || 0),
    meta: event.meta || {}
  };

  tradingEngine.events.push(normalized);
  tradingEngine.log.push(makeLogMessage(normalized));
}

export function logBuy(tradingEngine, payloadOrCrateName, maybeAmount) {
  const payload = typeof payloadOrCrateName === 'object'
    ? payloadOrCrateName
    : { crateName: payloadOrCrateName, amount: maybeAmount };
  appendTradeEvent(tradingEngine, { ...payload, type: 'BUY' });
}

export function logSell(tradingEngine, payloadOrCrateName, maybeAmount) {
  const payload = typeof payloadOrCrateName === 'object'
    ? payloadOrCrateName
    : { crateName: payloadOrCrateName, amount: maybeAmount };
  appendTradeEvent(tradingEngine, { ...payload, type: 'SELL' });
}

export function logPendingSell(tradingEngine, crateName, amount) {
  appendTradeEvent(tradingEngine, { type: 'PENDING_SELL', crateName, amount });
}

export function logSold(tradingEngine, crateName, amount) {
  appendTradeEvent(tradingEngine, { type: 'SOLD', crateName, amount });
}
