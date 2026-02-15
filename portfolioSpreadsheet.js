function clampNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeBlockValue(value, fallback = 100) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function normalizeTemplateFromRuntime(portfolio) {
  const blockValue = normalizeBlockValue(portfolio?.blockValue || portfolio?.monthlyContribution, 100);
  const investments = (portfolio?.cratesTemplate || []).map((crate) => ({
    investmentId: crate.crateId,
    crateId: crate.crateId,
    name: crate.name,
    targetPercent: clampNonNegativeNumber(crate.requestedPercent),
    slotTarget: Math.max(1, Math.floor(Number(crate.slotTarget) || 1)),
    overflowRatePerMinute: clampNonNegativeNumber(crate.overflowRatePerMinute ?? 1)
  }));

  return {
    stackId: portfolio?.stackId || crypto.randomUUID(),
    stackName: portfolio?.stackName || 'Stack Portfolio',
    monthlyContribution: clampNonNegativeNumber(portfolio?.monthlyContribution),
    blockValue,
    investments
  };
}

export function spreadsheetFromRuntime(portfolio) {
  const template = normalizeTemplateFromRuntime(portfolio);
  const positions = {};

  template.investments.forEach((investment) => {
    let value = 0;
    (portfolio?.stackCards || []).forEach((card) => {
      const crate = card?.crates?.find((item) => item.crateId === investment.investmentId);
      if (!crate) return;
      value += clampNonNegativeNumber(crate.valueDollars ?? (Number(crate.filled || 0) * template.blockValue));
    });

    const fullBlocks = Math.floor(value / template.blockValue);
    const overflowDollars = Math.max(0, value - (fullBlocks * template.blockValue));

    positions[investment.investmentId] = {
      fullBlocks,
      overflowDollars,
      totalInvestedDollars: value
    };
  });

  return {
    version: 1,
    template,
    cash: {
      waitingRoomBlocks: Math.max(0, Math.floor(Number(portfolio?.waitingRoomBlocks) || 0)),
      cashBalance: clampNonNegativeNumber(portfolio?.cashBalance)
    },
    positions,
    ledger: {
      events: Array.isArray(portfolio?.tradingEngine?.events) ? [...portfolio.tradingEngine.events] : []
    }
  };
}

export function runtimeFromSpreadsheet(spreadsheet, previousCards = []) {
  const blockValue = normalizeBlockValue(spreadsheet?.template?.blockValue, 100);
  const investments = spreadsheet?.template?.investments || [];

  const stacksNeeded = investments.reduce((max, investment) => {
    const pos = spreadsheet?.positions?.[investment.investmentId] || { fullBlocks: 0, overflowDollars: 0 };
    const fullBlocks = Math.max(0, Math.floor(Number(pos.fullBlocks) || 0));
    const overflowDollars = clampNonNegativeNumber(pos.overflowDollars);
    const overflowSlot = overflowDollars > 0.000001 && fullBlocks > 0 ? 1 : 0;
    const slotsNeeded = fullBlocks + overflowSlot;
    const count = Math.max(1, Math.ceil(slotsNeeded / investment.slotTarget));
    return Math.max(max, count);
  }, 1);

  const cards = Array.from({ length: stacksNeeded }, (_, cardIndex) => {
    const previous = previousCards[cardIndex];
    return {
      cardId: previous?.cardId || crypto.randomUUID(),
      crates: investments.map((investment) => {
        const pos = spreadsheet?.positions?.[investment.investmentId] || { fullBlocks: 0, overflowDollars: 0 };
        const fullBlocks = Math.max(0, Math.floor(Number(pos.fullBlocks) || 0));
        const overflowDollars = clampNonNegativeNumber(pos.overflowDollars);
        const slotTarget = Math.max(1, Number(investment.slotTarget) || 1);
        const start = cardIndex * slotTarget;

        const blocksInCard = Math.max(0, Math.min(slotTarget, fullBlocks - start));
        let valueDollars = blocksInCard * blockValue;

        if (overflowDollars > 0.000001 && fullBlocks > 0) {
          const overflowIndex = fullBlocks;
          const cardStart = cardIndex * slotTarget;
          const cardEnd = cardStart + slotTarget;
          if (overflowIndex >= cardStart && overflowIndex < cardEnd && blocksInCard < slotTarget) {
            valueDollars += Math.min(blockValue, overflowDollars);
          }
        }

        return {
          crateId: investment.investmentId,
          name: investment.name,
          requestedPercent: investment.targetPercent,
          slotTarget,
          filled: blocksInCard,
          valueDollars
        };
      })
    };
  });

  return {
    stackCards: cards,
    waitingRoomBlocks: Math.max(0, Math.floor(Number(spreadsheet?.cash?.waitingRoomBlocks) || 0)),
    cashBalance: clampNonNegativeNumber(spreadsheet?.cash?.cashBalance)
  };
}

export function applyBuyToSpreadsheet(spreadsheet, investmentId, amountBlocks = 1) {
  if (!spreadsheet || !spreadsheet.positions?.[investmentId]) return false;
  const qty = Math.max(1, Math.floor(Number(amountBlocks) || 1));
  if ((spreadsheet.cash.waitingRoomBlocks || 0) < qty) return false;
  spreadsheet.cash.waitingRoomBlocks -= qty;
  spreadsheet.positions[investmentId].fullBlocks = Math.max(0, Math.floor(Number(spreadsheet.positions[investmentId].fullBlocks) || 0) + qty);
  spreadsheet.positions[investmentId].totalInvestedDollars =
    (spreadsheet.positions[investmentId].fullBlocks * spreadsheet.template.blockValue) + clampNonNegativeNumber(spreadsheet.positions[investmentId].overflowDollars);
  return true;
}

export function applySellToSpreadsheet(spreadsheet, investmentId, amountBlocks = 1) {
  if (!spreadsheet || !spreadsheet.positions?.[investmentId]) return false;
  const qty = Math.max(1, Math.floor(Number(amountBlocks) || 1));
  const currentBlocks = Math.max(0, Math.floor(Number(spreadsheet.positions[investmentId].fullBlocks) || 0));
  if (currentBlocks < qty) return false;
  spreadsheet.positions[investmentId].fullBlocks = currentBlocks - qty;
  spreadsheet.cash.waitingRoomBlocks = Math.max(0, Math.floor(Number(spreadsheet.cash.waitingRoomBlocks) || 0) + qty);

  if (spreadsheet.positions[investmentId].fullBlocks <= 0) {
    spreadsheet.positions[investmentId].overflowDollars = 0;
  }

  spreadsheet.positions[investmentId].totalInvestedDollars =
    (spreadsheet.positions[investmentId].fullBlocks * spreadsheet.template.blockValue) + clampNonNegativeNumber(spreadsheet.positions[investmentId].overflowDollars);
  return true;
}

export function applyGrowthTickToSpreadsheet(spreadsheet, tickMs) {
  if (!spreadsheet || !spreadsheet.template?.investments) return;
  const blockValue = normalizeBlockValue(spreadsheet.template.blockValue, 100);
  spreadsheet.template.investments.forEach((investment) => {
    const position = spreadsheet.positions[investment.investmentId];
    if (!position) return;
    if ((position.fullBlocks || 0) <= 0) {
      position.overflowDollars = 0;
      position.totalInvestedDollars = position.fullBlocks * blockValue;
      return;
    }

    const rate = clampNonNegativeNumber(investment.overflowRatePerMinute ?? 1);
    const growthDollars = rate * blockValue * (Number(tickMs || 0) / 60000);
    let overflow = clampNonNegativeNumber(position.overflowDollars) + growthDollars;
    const mintedBlocks = Math.floor(overflow / blockValue);
    if (mintedBlocks > 0) {
      position.fullBlocks += mintedBlocks;
      overflow -= mintedBlocks * blockValue;
    }
    position.overflowDollars = Math.max(0, overflow);
    position.totalInvestedDollars = (position.fullBlocks * blockValue) + position.overflowDollars;
  });
}

export function applyExistingAmountsToSpreadsheet(spreadsheet, existingAmountsByInvestmentId = new Map()) {
  if (!spreadsheet || !spreadsheet.template?.investments) return;
  const blockValue = normalizeBlockValue(spreadsheet.template.blockValue, 100);
  spreadsheet.template.investments.forEach((investment) => {
    const current = spreadsheet.positions[investment.investmentId] || { fullBlocks: 0, overflowDollars: 0, totalInvestedDollars: 0 };
    const targetAmount = clampNonNegativeNumber(existingAmountsByInvestmentId.get(investment.investmentId));
    const fullBlocks = Math.floor(targetAmount / blockValue);
    const overflowDollars = Math.max(0, targetAmount - (fullBlocks * blockValue));
    spreadsheet.positions[investment.investmentId] = {
      fullBlocks,
      overflowDollars,
      totalInvestedDollars: targetAmount,
      deltaAmount: targetAmount - ((current.fullBlocks * blockValue) + clampNonNegativeNumber(current.overflowDollars))
    };
  });
}

export function compareRuntimeToSpreadsheet(portfolio, spreadsheet) {
  const runtimeSheet = spreadsheetFromRuntime(portfolio);
  const diagnostics = [];
  const allIds = new Set([
    ...Object.keys(runtimeSheet.positions || {}),
    ...Object.keys(spreadsheet?.positions || {})
  ]);

  allIds.forEach((id) => {
    const runtimePos = runtimeSheet.positions[id] || { fullBlocks: 0, overflowDollars: 0 };
    const sheetPos = spreadsheet?.positions?.[id] || { fullBlocks: 0, overflowDollars: 0 };
    if (runtimePos.fullBlocks !== sheetPos.fullBlocks || Math.abs(runtimePos.overflowDollars - sheetPos.overflowDollars) > 0.01) {
      diagnostics.push({
        investmentId: id,
        runtime: runtimePos,
        spreadsheet: sheetPos
      });
    }
  });

  if ((runtimeSheet.cash?.waitingRoomBlocks || 0) !== (spreadsheet?.cash?.waitingRoomBlocks || 0)) {
    diagnostics.push({
      investmentId: '__cash__',
      runtime: runtimeSheet.cash,
      spreadsheet: spreadsheet?.cash || {}
    });
  }

  return {
    matches: diagnostics.length === 0,
    diagnostics
  };
}
