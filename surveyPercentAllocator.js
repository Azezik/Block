function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value) {
  return Math.round(value * 10) / 10;
}

function distributeRemainder(items, targetTotal) {
  if (!items.length) return;
  const currentTotal = items.reduce((sum, item) => sum + item.targetPercent, 0);
  if (currentTotal <= 0) {
    const even = targetTotal / items.length;
    items.forEach((item) => {
      item.targetPercent = even;
    });
  } else {
    items.forEach((item) => {
      item.targetPercent = (item.targetPercent / currentTotal) * targetTotal;
    });
  }

  items.forEach((item) => {
    item.targetPercent = roundToTenth(item.targetPercent);
  });

  const roundedTotal = items.reduce((sum, item) => sum + item.targetPercent, 0);
  if (items.length) {
    items[items.length - 1].targetPercent = roundToTenth(items[items.length - 1].targetPercent + (targetTotal - roundedTotal));
  }
}

export function formatPercentForInput(value) {
  const rounded = roundToTenth(Number(value) || 0);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function buildSurveyInvestment(name = '', targetPercent = 0, existingAmount = 0, crateId = null) {
  return {
    name,
    targetPercent,
    existingAmount,
    crateId,
    percentManual: false,
    percentInput: formatPercentForInput(targetPercent)
  };
}

export function normalizeManualPercentChange(investments, changedIndex, rawInput) {
  const numeric = Number(rawInput);
  if (!Number.isFinite(numeric)) {
    investments[changedIndex].percentInput = rawInput;
    return false;
  }

  const current = investments[changedIndex];
  current.percentManual = true;

  const lockedOtherTotal = investments.reduce((sum, item, idx) => {
    if (idx === changedIndex || !item.percentManual) return sum;
    return sum + Number(item.targetPercent || 0);
  }, 0);

  const bounded = roundToTenth(clamp(numeric, 0, Math.max(0, 100 - lockedOtherTotal)));
  current.targetPercent = bounded;
  current.percentInput = rawInput;

  const unlocked = investments.filter((item, idx) => idx !== changedIndex && !item.percentManual);
  const unlockedTarget = Math.max(0, 100 - lockedOtherTotal - bounded);
  distributeRemainder(unlocked, unlockedTarget);

  return true;
}

export function autoDistributeAll(investments) {
  const unlocked = investments.filter((item) => !item.percentManual);
  distributeRemainder(unlocked, 100 - investments.reduce((sum, item) => sum + (item.percentManual ? Number(item.targetPercent || 0) : 0), 0));
}
