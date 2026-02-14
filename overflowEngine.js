export function createOverflowEngineState(crates = []) {
  return {
    crates: crates.map((crate) => ({
      crateId: crate.crateId,
      ratePerMinute: Math.max(0, Number(crate.overflowRatePerMinute || 1))
    }))
  };
}

export function ensureOverflowEngineCrates(overflowEngine, cratesTemplate = []) {
  if (!overflowEngine || !Array.isArray(overflowEngine.crates)) {
    return createOverflowEngineState(cratesTemplate);
  }

  const byCrateId = new Map(overflowEngine.crates.map((crate) => [crate.crateId, crate]));
  overflowEngine.crates = cratesTemplate.map((template) => {
    const existing = byCrateId.get(template.crateId);
    return {
      crateId: template.crateId,
      ratePerMinute: Math.max(0, Number(existing?.ratePerMinute ?? template.overflowRatePerMinute ?? 1))
    };
  });

  return overflowEngine;
}
