export function getCrateValue(crateState, blockValue) {
  const safeBlockValue = Math.max(0, Number(blockValue) || 0);
  const filled = Math.max(0, Number(crateState?.filled) || 0);
  const valueDollars = Number(crateState?.valueDollars);
  const currentValue = Number.isFinite(valueDollars)
    ? Math.max(0, valueDollars)
    : filled * safeBlockValue;
  const slotTarget = Math.max(0, Number(crateState?.slotTarget) || 0);

  return {
    currentValue,
    maxValue: slotTarget * safeBlockValue
  };
}

export function getCurrentStackValue(stackInstance, blockValue) {
  if (!Array.isArray(stackInstance?.crates)) return 0;
  return stackInstance.crates.reduce((sum, crate) => sum + getCrateValue(crate, blockValue).currentValue, 0);
}

export function getTotalInvestedValue(portfolio) {
  const safeBlockValue = Math.max(0, Number(portfolio?.blockValue) || 0);
  if (!Array.isArray(portfolio?.stackCards)) return 0;
  return portfolio.stackCards.reduce((stackSum, stackCard) => (
    stackSum + getCurrentStackValue(stackCard, safeBlockValue)
  ), 0);
}

export function getTotalCashValue(portfolio) {
  const safeBlockValue = Math.max(0, Number(portfolio?.blockValue) || 0);
  const waitingRoomBlocks = Math.max(0, Number(portfolio?.waitingRoomBlocks) || 0);
  return waitingRoomBlocks * safeBlockValue;
}

export function getTotalPortfolioValue(portfolio) {
  return getTotalCashValue(portfolio) + getTotalInvestedValue(portfolio);
}

export function getFullStackValue(portfolio) {
  if (!Array.isArray(portfolio?.cratesTemplate)) return 0;
  const safeBlockValue = Math.max(0, Number(portfolio?.blockValue) || 0);
  return portfolio.cratesTemplate.reduce((sum, crate) => {
    const slotTarget = Math.max(0, Number(crate?.slotTarget) || 0);
    return sum + (slotTarget * safeBlockValue);
  }, 0);
}

export function getQuickProgressReport(portfolio) {
  const activeCard = portfolio?.stackCards?.[portfolio?.activeCardIndex] || null;
  const blockValue = Math.max(0, Number(portfolio?.blockValue) || 0);

  const perCrate = (portfolio?.cratesTemplate || []).map((crateTemplate) => {
    const activeCrate = activeCard?.crates?.find((crate) => crate.crateId === crateTemplate.crateId) || {
      filled: 0,
      slotTarget: crateTemplate.slotTarget
    };
    const value = getCrateValue(activeCrate, blockValue);
    return {
      crateId: crateTemplate.crateId,
      crateName: crateTemplate.name,
      currentValue: value.currentValue,
      maxValue: value.maxValue
    };
  });

  return {
    fullStackValue: getFullStackValue(portfolio),
    currentStackValue: getCurrentStackValue(activeCard, blockValue),
    totalPortfolioValue: getTotalPortfolioValue(portfolio),
    totalInvestedValue: getTotalInvestedValue(portfolio),
    totalCashValue: getTotalCashValue(portfolio),
    perCrate
  };
}

export function getMoneyFlowRates(portfolio) {
  const cashMintRatePerMinute = Number(portfolio?.cashMintRatePerMinute || 1);
  const overflowRates = (portfolio?.cratesTemplate || []).map((crate) => ({
    crateId: crate.crateId,
    crateName: crate.name,
    overflowRatePerMinute: Math.max(0, Number(crate.overflowRatePerMinute || 1))
  }));

  return {
    cashMintRatePerMinute: Math.max(0, cashMintRatePerMinute),
    overflowRates
  };
}

function makeStackCardFromTemplate(cratesTemplate = []) {
  return {
    cardId: crypto.randomUUID(),
    crates: cratesTemplate.map((crate) => ({
      crateId: crate.crateId,
      name: crate.name,
      requestedPercent: crate.requestedPercent,
      slotTarget: crate.slotTarget,
      filled: 0,
      overflowFilled: 0
    }))
  };
}

export function computeSuggestedExistingAmounts(portfolio) {
  const blockValue = Math.max(0, Number(portfolio?.blockValue) || 0);
  const filledByCrateId = new Map();

  (portfolio?.stackCards || []).forEach((card) => {
    (card?.crates || []).forEach((crate) => {
      const filled = Math.max(0, Number(crate?.filled) || 0);
      filledByCrateId.set(crate.crateId, (filledByCrateId.get(crate.crateId) || 0) + filled);
    });
  });

  const overflowByCrateId = new Map((portfolio?.moneyEngine?.crates || []).map((crate) => [
    crate.crateId,
    Math.max(0, Number(crate?.overflowDollars) || 0)
  ]));

  return (portfolio?.cratesTemplate || []).map((crate) => {
    const filledBlocks = filledByCrateId.get(crate.crateId) || 0;
    const overflowDollars = overflowByCrateId.get(crate.crateId) || 0;
    const suggestedAmount = (filledBlocks * blockValue) + overflowDollars;
    const currentStoredAmount = Math.max(0, Number(crate.existingAmount || 0));
    return {
      crateId: crate.crateId,
      suggestedAmount,
      currentStoredAmount
    };
  });
}

export function computeExistingAmountDelta(currentAmount, nextAmount) {
  const current = Math.max(0, Number(currentAmount) || 0);
  const next = Math.max(0, Number(nextAmount) || 0);
  return next - current;
}

export function reconcileExistingAmountsWithPortfolio(portfolio, nextExistingAmountByCrateId) {
  const blockValue = Math.max(0, Number(portfolio?.blockValue) || 0);
  const suggestedByCrateId = new Map(computeSuggestedExistingAmounts(portfolio).map((item) => [item.crateId, item.suggestedAmount]));
  const normalizedTargets = (portfolio?.cratesTemplate || []).map((crate) => {
    const targetAmount = Math.max(0, Number(nextExistingAmountByCrateId?.get(crate.crateId) ?? suggestedByCrateId.get(crate.crateId) ?? 0));
    return {
      crateId: crate.crateId,
      targetAmount,
      deltaAmount: computeExistingAmountDelta(suggestedByCrateId.get(crate.crateId) ?? 0, targetAmount),
      startingFilledBlocks: blockValue > 0 ? Math.floor(targetAmount / blockValue) : 0,
      overflowDollars: blockValue > 0 ? targetAmount % blockValue : 0
    };
  });

  const nextTemplateByCrateId = new Map(normalizedTargets.map((target) => [target.crateId, target]));
  portfolio.cratesTemplate = (portfolio.cratesTemplate || []).map((crate) => {
    const next = nextTemplateByCrateId.get(crate.crateId);
    if (!next) return crate;
    return {
      ...crate,
      existingAmount: next.targetAmount,
      startingFilledBlocks: next.startingFilledBlocks,
      overflowDollars: next.overflowDollars
    };
  });

  portfolio.moneyEngine = {
    blockValue,
    crates: normalizedTargets.map((target) => ({
      crateId: target.crateId,
      existingAmount: target.targetAmount,
      startingFilledBlocks: target.startingFilledBlocks,
      overflowDollars: target.overflowDollars,
      deltaAmount: target.deltaAmount
    }))
  };

  const stackCards = [];
  normalizedTargets.forEach((target) => {
    let remainingBlocks = target.startingFilledBlocks;
    let cardIndex = 0;

    while (remainingBlocks > 0) {
      if (!stackCards[cardIndex]) {
        stackCards[cardIndex] = makeStackCardFromTemplate(portfolio.cratesTemplate || []);
      }
      const targetCrate = stackCards[cardIndex].crates.find((crate) => crate.crateId === target.crateId);
      if (!targetCrate) break;

      const capacity = Math.max(0, targetCrate.slotTarget - targetCrate.filled);
      if (capacity <= 0) {
        cardIndex += 1;
        continue;
      }

      const assigned = Math.min(capacity, remainingBlocks);
      targetCrate.filled += assigned;
      remainingBlocks -= assigned;
      cardIndex += 1;
    }
  });

  portfolio.stackCards = stackCards.length ? stackCards : [makeStackCardFromTemplate(portfolio.cratesTemplate || [])];

  const firstIncompleteCardIndex = portfolio.stackCards.findIndex((card) => card.crates.some((crate) => crate.filled < crate.slotTarget));
  portfolio.activeCardIndex = firstIncompleteCardIndex >= 0 ? firstIncompleteCardIndex : portfolio.stackCards.length - 1;
}
