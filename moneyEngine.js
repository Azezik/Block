export function getCrateValue(crateState, blockValue) {
  const safeBlockValue = Math.max(0, Number(blockValue) || 0);
  const filled = Math.max(0, Number(crateState?.filled) || 0);
  const slotTarget = Math.max(0, Number(crateState?.slotTarget) || 0);

  return {
    currentValue: filled * safeBlockValue,
    maxValue: slotTarget * safeBlockValue
  };
}

export function getCurrentStackValue(stackInstance, blockValue) {
  if (!Array.isArray(stackInstance?.crates)) return 0;
  return stackInstance.crates.reduce((sum, crate) => sum + getCrateValue(crate, blockValue).currentValue, 0);
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
    perCrate
  };
}
