import { computeCrateLayout } from './crateLayoutEngine.js';
import { createStackSelector } from './stackSelector.js';
import { createStackCarousel } from './stackCarousel.js';
import { createPortfolioSettings } from './portfolioSettings.js';
import {
  computeSuggestedExistingAmounts,
  getMoneyFlowRates,
  getQuickProgressReport,
  reconcileExistingAmountsWithPortfolio
} from './moneyEngine.js';
import {
  autoDistributeAll,
  buildSurveyInvestment,
  formatPercentForInput,
  normalizeManualPercentChange
} from './surveyPercentAllocator.js';
import {
  createOverflowEngineState,
  ensureOverflowEngineCrates
} from './overflowEngine.js';
import { renderTradeLog } from './tradeLog.js';
import { createTradingEngineState, logBuy } from './tradingEngine.js';

const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;
const STORAGE_KEY = 'block.custom.stacks.v6';
const LEGACY_STORAGE_KEY = 'block.custom.stacks.v3';
const MONTHLY_BUDGET_OPTIONS = [100, 250, 500, 750, 1000];
const MAX_STACK_SLOTS = 24;
const MIN_STACK_SLOTS = 10;

const initialDemoCrates = [
  { name: 'HDIV', capacity: 6, blocksFilled: 0 },
  { name: 'VDY', capacity: 3, blocksFilled: 0 },
  { name: 'HCAL', capacity: 3, blocksFilled: 0 }
];

const state = {
  activeTab: 'demo',
  demo: makeDemoRuntime(),
  customRuntimes: [],
  selectedCustomStackId: null,
  activeSettings: false,
  deleteModalOpen: false,
  survey: { open: false, mode: 'create', step: 1, editingId: null, values: getEmptySurveyValues() }
};

const nodes = {
  tabDemo: document.getElementById('tabDemo'),
  tabMyStacks: document.getElementById('tabMyStacks'),
  demoView: document.getElementById('demoView'),
  myStacksView: document.getElementById('myStacksView'),
  monthIndicator: document.getElementById('monthIndicator'),
  cashFill: document.getElementById('cashFill'),
  cashPercent: document.getElementById('cashPercent'),
  cashStatus: document.getElementById('cashStatus'),
  availableBlocks: document.getElementById('availableBlocks'),
  crateGrid: document.getElementById('crateGrid'),
  customMonthIndicator: document.getElementById('customMonthIndicator'),
  customCashFill: document.getElementById('customCashFill'),
  customCashPercent: document.getElementById('customCashPercent'),
  customCashStatus: document.getElementById('customCashStatus'),
  customAvailableBlocks: document.getElementById('customAvailableBlocks'),
  tradeLog: document.getElementById('tradeLog'),
  customCrateGrid: document.getElementById('customCrateGrid'),
  customStackWorkspace: document.getElementById('customStackWorkspace'),
  stackNavShell: document.getElementById('stackNavShell'),
  customCashTitle: document.getElementById('customCashTitle'),
  customBoardTitle: document.getElementById('customBoardTitle'),
  customStackFill: document.getElementById('customStackFill'),
  customWaitingRoomCount: document.getElementById('customWaitingRoomCount'),
  customCashBalance: document.getElementById('customCashBalance'),
  customCompletedStacks: document.getElementById('customCompletedStacks'),
  stackSelectorBtn: document.getElementById('stackSelectorBtn'),
  stackSelectorMenu: document.getElementById('stackSelectorMenu'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  portfolioSettingsView: document.getElementById('portfolioSettingsView'),
  portfolioSettingsSave: document.getElementById('portfolioSettingsSave'),
  portfolioSettingsCancel: document.getElementById('portfolioSettingsCancel'),
  portfolioSettingsDelete: document.getElementById('portfolioSettingsDelete'),
  portfolioSettingsAdd: document.getElementById('portfolioSettingsAdd'),
  stackCarouselTrack: document.getElementById('stackCarouselTrack'),
  stackPrevBtn: document.getElementById('stackPrevBtn'),
  stackNextBtn: document.getElementById('stackNextBtn'),
  stackCardMeta: document.getElementById('stackCardMeta'),
  createStackBtn: document.getElementById('createStackBtn'),
  editStackBtn: document.getElementById('editStackBtn'),
  surveyModal: document.getElementById('surveyModal'),
  deletePortfolioModal: document.getElementById('deletePortfolioModal'),
  deletePortfolioCancel: document.getElementById('deletePortfolioCancel'),
  deletePortfolioConfirm: document.getElementById('deletePortfolioConfirm'),
  surveyQuestion: document.getElementById('surveyQuestion'),
  surveyBody: document.getElementById('surveyBody'),
  surveyContent: document.getElementById('surveyContent'),
  surveyError: document.getElementById('surveyError'),
  surveyStepLabel: document.getElementById('surveyStepLabel'),
  surveyProgressFill: document.getElementById('surveyProgressFill'),
  surveyClose: document.getElementById('surveyClose'),
  surveyCancel: document.getElementById('surveyCancel'),
  surveyBack: document.getElementById('surveyBack'),
  surveyNext: document.getElementById('surveyNext'),
  crateTemplate: document.getElementById('crateTemplate')
};

function normalizeBlockValue(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return MONTHLY_BUDGET_OPTIONS[0];
}

function adjustSlotsToTotal(raw, slots, total) {
  let adjustments = 0;

  while (slots.reduce((sum, value) => sum + value, 0) > total) {
    const candidates = slots
      .map((value, idx) => ({ idx, value, overshoot: value - raw[idx] }))
      .filter((item) => item.value > 1)
      .sort((a, b) => b.overshoot - a.overshoot || a.idx - b.idx);
    if (!candidates.length) break;
    slots[candidates[0].idx] -= 1;
    adjustments += 1;
  }

  while (slots.reduce((sum, value) => sum + value, 0) < total) {
    const candidates = slots
      .map((value, idx) => ({ idx, deficit: raw[idx] - value }))
      .sort((a, b) => b.deficit - a.deficit || a.idx - b.idx);
    slots[candidates[0].idx] += 1;
    adjustments += 1;
  }

  return adjustments;
}

function computeSlotTargets(crates) {
  const crateCount = crates.length;
  const weights = crates.map((crate) => Number(crate.requestedPercent) / 100);

  if (crateCount === 4) {
    const leadIndex = weights.findIndex((weight) => Math.abs(weight - 0.5) < 0.02);
    const tailCount = weights.filter((weight, idx) => idx !== leadIndex && Math.abs(weight - 0.167) < 0.02).length;
    if (leadIndex >= 0 && tailCount === 3) {
      const slots = [1, 1, 1, 1];
      slots[leadIndex] = 5;
      return { totalSlots: 8, slots, adjustments: 0, error: 0 };
    }
  }

  let best = null;

  for (let totalSlots = crateCount; totalSlots <= MAX_STACK_SLOTS; totalSlots += 1) {
    const raw = weights.map((weight) => weight * totalSlots);
    const slots = raw.map((value) => Math.max(1, Math.round(value)));
    const adjustments = adjustSlotsToTotal(raw, slots, totalSlots);
    const error = slots.reduce((sum, slot, idx) => sum + Math.abs((slot / totalSlots) - weights[idx]), 0);
    const candidate = { totalSlots, slots, adjustments, error };

    if (!best
      || candidate.error < best.error
      || (Math.abs(candidate.error - best.error) < 1e-9 && candidate.totalSlots < best.totalSlots)
      || (Math.abs(candidate.error - best.error) < 1e-9 && candidate.totalSlots === best.totalSlots && candidate.adjustments < best.adjustments)) {
      best = candidate;
    }
  }

  const selected = best || { totalSlots: crateCount, slots: Array(crateCount).fill(1), adjustments: 0, error: 0 };
  if (selected.totalSlots >= MIN_STACK_SLOTS) return selected;

  const multiplier = Math.ceil(MIN_STACK_SLOTS / selected.totalSlots);
  return {
    ...selected,
    totalSlots: selected.totalSlots * multiplier,
    slots: selected.slots.map((slot) => slot * multiplier)
  };
}

function calculateTargets(stack) {
  stack.blockValue = normalizeBlockValue(stack.monthlyContribution);
  const slotPlan = computeSlotTargets(stack.crates);
  stack.fullStackSize = slotPlan.totalSlots;

  stack.crates.forEach((crate, idx) => {
    crate.slotTarget = slotPlan.slots[idx];
    const legacyFilled = Number(crate.filled ?? crate.blocksFilled ?? crate.plannedBlocksFilled ?? 0) + Number(crate.extraBlocksFilled || 0);
    crate.filled = Math.max(0, Math.min(legacyFilled, crate.slotTarget));
  });

  return stack;
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
      valueDollars: 0
    }))
  };
}

function toPortfolioModel(stack) {
  const normalized = calculateTargets({ ...stack, crates: stack.crates.map((crate) => ({ ...crate })) });
  const cratesTemplate = normalized.crates.map((crate) => ({
    crateId: crate.crateId,
    name: crate.name,
    requestedPercent: crate.requestedPercent,
    slotTarget: crate.slotTarget,
    existingAmount: Number(crate.existingAmount || 0),
    startingFilledBlocks: 0,
    overflowDollars: 0,
    overflowRatePerMinute: Math.max(0, Number(crate.overflowRatePerMinute ?? 1))
  }));

  const moneyEngineCrates = cratesTemplate.map((crate) => {
    const existingAmount = Number(crate.existingAmount || 0);
    const startingFilledBlocks = Math.floor(existingAmount / normalized.blockValue);
    const overflowDollars = existingAmount % normalized.blockValue;
    crate.startingFilledBlocks = startingFilledBlocks;
    crate.overflowDollars = overflowDollars;
    return {
      crateId: crate.crateId,
      existingAmount,
      startingFilledBlocks,
      overflowDollars
    };
  });

  const stackCards = [];
  moneyEngineCrates.forEach((moneyState) => {
    let remainingBlocks = moneyState.startingFilledBlocks;
    let cardIndex = 0;

    while (remainingBlocks > 0) {
      if (!stackCards[cardIndex]) {
        stackCards[cardIndex] = makeStackCardFromTemplate(cratesTemplate);
      }
      const targetCrate = stackCards[cardIndex].crates.find((crate) => crate.crateId === moneyState.crateId);
      if (!targetCrate) break;

      const capacity = Math.max(0, targetCrate.slotTarget - targetCrate.filled);
      if (capacity <= 0) {
        cardIndex += 1;
        continue;
      }

      const assigned = Math.min(capacity, remainingBlocks);
      targetCrate.filled += assigned;
      targetCrate.valueDollars = (targetCrate.valueDollars || 0) + (assigned * normalized.blockValue);
      remainingBlocks -= assigned;
      cardIndex += 1;
    }
  });

  if (!stackCards.length) {
    stackCards.push(makeStackCardFromTemplate(cratesTemplate));
  }

  const firstIncompleteCardIndex = stackCards.findIndex((card) => card.crates.some((crate) => crate.filled < crate.slotTarget));
  const activeCardIndex = firstIncompleteCardIndex >= 0 ? firstIncompleteCardIndex : stackCards.length - 1;
  const completedStacks = stackCards.filter((card) => card.crates.every((crate) => crate.filled === crate.slotTarget)).length;

  return {
    stackId: normalized.stackId,
    stackName: normalized.stackName,
    monthlyContribution: normalized.monthlyContribution,
    blockValue: normalized.blockValue,
    cashBalance: normalized.cashBalance,
    waitingRoomBlocks: normalized.waitingRoomBlocks,
    completedStacks,
    monthCounter: normalized.monthCounter,
    elapsedMsInPeriod: normalized.elapsedMsInPeriod,
    fullStackSize: normalized.fullStackSize,
    cratesTemplate,
    moneyEngine: {
      blockValue: normalized.blockValue,
      crates: moneyEngineCrates
    },
    overflowEngine: createOverflowEngineState(cratesTemplate),
    tradingEngine: createTradingEngineState(),
    cashMintRatePerMinute: 1,
    stackCards,
    activeCardIndex
  };
}

function getActiveStackCard(portfolio) {
  return portfolio.stackCards[portfolio.activeCardIndex] || null;
}

function getCrateBlocksAndOverflow(crate, blockValue) {
  const value = Math.max(0, Number(crate.valueDollars || (crate.filled || 0) * blockValue));
  const fullBlocks = Math.min(crate.slotTarget, Math.floor(value / blockValue));
  const remainder = Math.max(0, value - (fullBlocks * blockValue));
  return { value, fullBlocks, overflowPercent: Math.min(100, (remainder / blockValue) * 100) };
}

function refreshCrateFilled(crate, blockValue) {
  const stats = getCrateBlocksAndOverflow(crate, blockValue);
  crate.filled = stats.fullBlocks;
}

function getOrCreateCardAtIndex(portfolio, cardIndex) {
  while (portfolio.stackCards.length <= cardIndex) {
    portfolio.stackCards.push(makeStackCardFromTemplate(portfolio.cratesTemplate));
  }
  return portfolio.stackCards[cardIndex];
}

function applyValueToCrateWithRollover(portfolio, crateId, amountDollars, startCardIndex = portfolio.activeCardIndex) {
  const amount = Number(amountDollars);
  if (!Number.isFinite(amount) || amount <= 0) return { applied: false, lastTouchedCardIndex: Math.max(0, Number(startCardIndex || 0)) };

  const blockValue = normalizeBlockValue(portfolio.blockValue || portfolio.monthlyContribution);
  portfolio.blockValue = blockValue;

  let remaining = amount;
  let cardIndex = Math.max(0, Number(startCardIndex || 0));
  let lastTouchedCardIndex = cardIndex;

  while (remaining > 0.000001) {
    const card = getOrCreateCardAtIndex(portfolio, cardIndex);
    const crate = card.crates.find((entry) => entry.crateId === crateId);
    if (!crate) return { applied: false, lastTouchedCardIndex };

    crate.valueDollars = Math.max(0, Number(crate.valueDollars || (crate.filled || 0) * blockValue));
    const maxValue = crate.slotTarget * blockValue;
    const capacity = Math.max(0, maxValue - crate.valueDollars);

    if (capacity > 0.000001) {
      const applied = Math.min(capacity, remaining);
      crate.valueDollars += applied;
      remaining -= applied;
      refreshCrateFilled(crate, blockValue);
      lastTouchedCardIndex = cardIndex;
      continue;
    }

    cardIndex += 1;
  }

  syncPortfolioCardState(portfolio);
  return { applied: true, lastTouchedCardIndex };
}

function findFirstCardWithCrateCapacity(portfolio, crateId) {
  const blockValue = normalizeBlockValue(portfolio.blockValue || portfolio.monthlyContribution);
  for (let cardIndex = 0; cardIndex < portfolio.stackCards.length; cardIndex += 1) {
    const card = portfolio.stackCards[cardIndex];
    const crate = card.crates.find((entry) => entry.crateId === crateId);
    if (!crate) continue;
    crate.valueDollars = Math.max(0, Number(crate.valueDollars || (crate.filled || 0) * blockValue));
    const maxValue = crate.slotTarget * blockValue;
    if ((maxValue - crate.valueDollars) > 0.000001) return cardIndex;
  }
  return Math.max(0, portfolio.stackCards.length - 1);
}

function isStackCardFull(card, blockValue) {
  return card.crates.every((crate) => getCrateBlocksAndOverflow(crate, blockValue).fullBlocks === crate.slotTarget);
}

function syncPortfolioCardState(portfolio) {
  if (!Array.isArray(portfolio.stackCards) || !portfolio.stackCards.length) {
    portfolio.stackCards = [makeStackCardFromTemplate(portfolio.cratesTemplate || [])];
  }

  portfolio.activeCardIndex = Math.max(0, Math.min(portfolio.stackCards.length - 1, Number(portfolio.activeCardIndex || 0)));

  portfolio.stackCards = portfolio.stackCards.map((card) => ({
    ...card,
    crates: card.crates.map((crate) => ({
      ...crate,
      valueDollars: Math.max(0, Number(crate.valueDollars ?? ((crate.filled || 0) * portfolio.blockValue))),
      filled: Math.min(crate.slotTarget, Math.floor(Math.max(0, Number(crate.valueDollars ?? ((crate.filled || 0) * portfolio.blockValue))) / portfolio.blockValue))
    }))
  }));

  portfolio.completedStacks = portfolio.stackCards.filter((card) => isStackCardFull(card, portfolio.blockValue)).length;
}

const StackRules = {
  validateDraft(draft) {
    if (!draft.stackName || !draft.stackName.trim()) return 'Stack name is required.';
    if (!MONTHLY_BUDGET_OPTIONS.includes(Number(draft.monthlyContribution))) return 'Choose a monthly contribution option.';
    const named = draft.investments.map((item) => ({ ...item, name: item.name.trim() })).filter((item) => item.name);
    if (named.length < 2 || named.length > 20) return 'Add between 2 and 20 investments.';
    const totalPercent = named.reduce((sum, item) => sum + Number(item.targetPercent || 0), 0);
    if (Math.abs(totalPercent - 100) > 0.01) return 'Allocation percentages must total 100%.';
    return null;
  },

  normalizeStackDraft(draft) {
    const err = StackRules.validateDraft(draft);
    if (err) throw new Error(err);

    const stack = {
      stackId: draft.stackId || crypto.randomUUID(),
      stackName: draft.stackName.trim(),
      monthlyContribution: Number(draft.monthlyContribution),
      blockValue: Number(draft.monthlyContribution),
      cashBalance: Number(draft.cashBalance || draft.cashAccumulated || 0),
      waitingRoomBlocks: Number(draft.waitingRoomBlocks ?? draft.availableBlocks ?? draft.generatedBlocksAvailable ?? 0),
      completedStacks: Number(draft.completedStacks || 0),
      monthCounter: Number(draft.monthCounter || 1),
      elapsedMsInPeriod: Number(draft.elapsedMsInPeriod || draft.elapsedMsInYear || 0),
      crates: draft.investments
        .map((item) => ({
          crateId: item.crateId || crypto.randomUUID(),
          name: item.name.trim(),
          requestedPercent: Number(item.targetPercent ?? item.requestedPercent ?? 0),
          filled: Number(item.filled ?? item.blocksFilled ?? item.plannedBlocksFilled ?? 0),
          existingAmount: Math.max(0, Number(item.existingAmount || 0)),
          overflowRatePerMinute: Math.max(0, Number(item.overflowRatePerMinute ?? 1))
        }))
        .filter((item) => item.name)
    };

    calculateTargets(stack);
    StackRules.assertStackModel(stack);
    return stack;
  },

  assertStackModel(stack) {
    if (!stack.stackId || !Array.isArray(stack.crates)) throw new Error('Invalid stack.');
    const totalPercent = stack.crates.reduce((sum, crate) => sum + Number(crate.requestedPercent || 0), 0);
    if (Math.abs(totalPercent - 100) > 0.1) throw new Error('Crate percentages must total 100%.');
  },

  normalizeLoadedStack(rawStack) {
    const monthly = MONTHLY_BUDGET_OPTIONS.includes(Number(rawStack.monthlyContribution)) ? Number(rawStack.monthlyContribution) : 100;

    if (Array.isArray(rawStack.crates) && rawStack.crates.length) {
      const stack = {
        stackId: rawStack.stackId || crypto.randomUUID(),
        stackName: rawStack.stackName || 'Imported Stack',
        monthlyContribution: monthly,
        blockValue: monthly,
        cashBalance: Number(rawStack.cashBalance || rawStack.cashAccumulated || 0),
        waitingRoomBlocks: Number(rawStack.waitingRoomBlocks ?? rawStack.availableBlocks ?? rawStack.generatedBlocksAvailable ?? 0),
        completedStacks: Number(rawStack.completedStacks || 0),
        monthCounter: Number(rawStack.monthCounter || 1),
        elapsedMsInPeriod: Number(rawStack.elapsedMsInPeriod || rawStack.elapsedMsInYear || 0),
        crates: rawStack.crates.map((crate) => {
          const legacyActualBlocks = Number(crate.actualDollar || 0) / monthly;
          const legacyPlanned = Number(crate.plannedBlocksFilled || Math.floor(legacyActualBlocks));
          const legacyExtra = Number(crate.extraBlocksFilled || 0);
          return {
            crateId: crate.crateId || crypto.randomUUID(),
            name: crate.name || 'Investment',
            requestedPercent: Number(crate.requestedPercent ?? crate.targetPercent ?? 0),
            filled: Number(crate.filled ?? crate.blocksFilled ?? (legacyPlanned + legacyExtra)),
            existingAmount: Math.max(0, Number(crate.existingAmount || 0)),
            overflowRatePerMinute: Math.max(0, Number(crate.overflowRatePerMinute ?? 1))
          };
        })
      };
      return calculateTargets(stack);
    }

    return StackRules.normalizeStackDraft({
      stackId: rawStack.stackId || rawStack.id || crypto.randomUUID(),
      stackName: rawStack.stackName || 'Imported Stack',
      monthlyContribution: monthly,
      cashBalance: Number(rawStack.cashAccumulated || 0),
      waitingRoomBlocks: Number(rawStack.generatedBlocksAvailable || 0),
      monthCounter: Number(rawStack.monthCounter || 1),
      elapsedMsInPeriod: Number(rawStack.elapsedMsInPeriod || rawStack.elapsedMsInYear || 0),
      investments: [
        { name: 'Investment 1', targetPercent: 50 },
        { name: 'Investment 2', targetPercent: 50 }
      ]
    });
  }
};

const StackStorage = {
  loadStacks() {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => {
        if (Array.isArray(entry.stackCards) && Array.isArray(entry.cratesTemplate)) {
          const blockValue = normalizeBlockValue(entry.blockValue || entry.monthlyContribution);
          const cratesTemplate = entry.cratesTemplate.map((crate) => {
            const existingAmount = Math.max(0, Number(crate.existingAmount || 0));
            const startingFilledBlocks = Number.isFinite(crate.startingFilledBlocks)
              ? Math.max(0, Number(crate.startingFilledBlocks))
              : Math.floor(existingAmount / blockValue);
            const overflowDollars = Number.isFinite(crate.overflowDollars)
              ? Math.max(0, Number(crate.overflowDollars))
              : existingAmount % blockValue;
            return {
              ...crate,
              existingAmount,
              startingFilledBlocks,
              overflowDollars,
              overflowRatePerMinute: Math.max(0, Number(crate.overflowRatePerMinute ?? 1))
            };
          });
          const moneyEngineCrates = cratesTemplate.map((crate) => ({
            crateId: crate.crateId,
            existingAmount: crate.existingAmount,
            startingFilledBlocks: crate.startingFilledBlocks,
            overflowDollars: crate.overflowDollars
          }));
          const normalizedPortfolio = {
            ...entry,
            cratesTemplate,
            activeCardIndex: Number(entry.activeCardIndex || 0),
            moneyEngine: {
              blockValue,
              crates: Array.isArray(entry.moneyEngine?.crates) && entry.moneyEngine.crates.length
                ? entry.moneyEngine.crates.map((crate) => ({
                  crateId: crate.crateId,
                  existingAmount: Math.max(0, Number(crate.existingAmount || 0)),
                  startingFilledBlocks: Math.max(0, Number(crate.startingFilledBlocks || 0)),
                  overflowDollars: Math.max(0, Number(crate.overflowDollars || 0))
                }))
                : moneyEngineCrates
            },
            stackCards: entry.stackCards.map((card) => ({
              cardId: card.cardId || crypto.randomUUID(),
              crates: card.crates.map((crate) => ({ ...crate, valueDollars: Math.max(0, Number(crate.valueDollars ?? ((crate.filled || 0) * blockValue)) ), blockValue }))
            })),
            overflowEngine: ensureOverflowEngineCrates(entry.overflowEngine, cratesTemplate),
            tradingEngine: entry.tradingEngine?.log ? entry.tradingEngine : createTradingEngineState(),
            cashMintRatePerMinute: Math.max(0, Number(entry.cashMintRatePerMinute || 1))
          };
          syncPortfolioCardState(normalizedPortfolio);
          return normalizedPortfolio;
        }
        const portfolio = toPortfolioModel(StackRules.normalizeLoadedStack(entry));
        syncPortfolioCardState(portfolio);
        return portfolio;
      });
    } catch {
      return [];
    }
  }
};


function checkAndAdvanceCompletedCard(portfolio) {
  syncPortfolioCardState(portfolio);
}

const StackEngine = {
  tickStack(stack) {
    const blockValue = normalizeBlockValue(stack.blockValue || stack.monthlyContribution);
    stack.blockValue = blockValue;
    stack.elapsedMsInPeriod += TICK_MS;
    while (stack.elapsedMsInPeriod >= MONTH_DURATION_MS) {
      stack.monthCounter += 1;
      stack.cashBalance += stack.monthlyContribution;
      stack.elapsedMsInPeriod -= MONTH_DURATION_MS;
      while (stack.cashBalance >= blockValue) {
        stack.waitingRoomBlocks += 1;
        stack.cashBalance -= blockValue;
      }
    }

    ensureOverflowEngineCrates(stack.overflowEngine, stack.cratesTemplate);
    stack.overflowEngine.crates.forEach((overflowCrate) => {
      const template = stack.cratesTemplate.find((entry) => entry.crateId === overflowCrate.crateId);
      const rate = Math.max(0, Number(template?.overflowRatePerMinute ?? overflowCrate.ratePerMinute ?? 1));
      const growthDollars = rate * blockValue * (TICK_MS / 60000);
      const startCardIndex = findFirstCardWithCrateCapacity(stack, overflowCrate.crateId);
      const result = applyValueToCrateWithRollover(stack, overflowCrate.crateId, growthDollars, startCardIndex);
      overflowCrate.cursorCardIndex = result.lastTouchedCardIndex;
    });
    checkAndAdvanceCompletedCard(stack);
  },

  allocateBlockToCrate(portfolio, crateId) {
    const activeCard = getActiveStackCard(portfolio);
    if (!activeCard || portfolio.waitingRoomBlocks <= 0) return false;
    if (!applyValueToCrateWithRollover(portfolio, crateId, portfolio.blockValue, portfolio.activeCardIndex).applied) return false;
    portfolio.waitingRoomBlocks -= 1;
    const crateName = portfolio.cratesTemplate.find((entry) => entry.crateId === crateId)?.name || 'UNKNOWN';
    logBuy(portfolio.tradingEngine, crateName, portfolio.blockValue);
    checkAndAdvanceCompletedCard(portfolio);
    return true;
  },

  moveFullBlock(portfolio, fromCrateId, toCrateId) {
    const activeCard = getActiveStackCard(portfolio);
    if (!activeCard || fromCrateId === toCrateId) return false;
    const from = activeCard.crates.find((item) => item.crateId === fromCrateId);
    const to = activeCard.crates.find((item) => item.crateId === toCrateId);
    if (!from || !to) return false;

    from.valueDollars = Math.max(0, Number(from.valueDollars || (from.filled || 0) * portfolio.blockValue));
    to.valueDollars = Math.max(0, Number(to.valueDollars || (to.filled || 0) * portfolio.blockValue));
    const fromBlocks = Math.floor(from.valueDollars / portfolio.blockValue);
    const toBlocks = Math.floor(to.valueDollars / portfolio.blockValue);
    if (fromBlocks <= 0 || toBlocks >= to.slotTarget) return false;

    from.valueDollars = Math.max(0, from.valueDollars - portfolio.blockValue);
    to.valueDollars += portfolio.blockValue;
    checkAndAdvanceCompletedCard(portfolio);
    return true;
  }
};

function makeDemoRuntime() {
  return {
    id: 'demo',
    stackName: 'Demo Stack',
    monthlyContribution: 500,
    crates: initialDemoCrates.map((crate) => ({ ...crate })),
    blocks: { available: new Set(), allocated: new Map() },
    time: { month: 1, progress: 0 },
    nextBlockSerial: 0
  };
}

function getEmptySurveyValues() {
  return {
    stackName: '',
    monthlyContribution: null,
    investments: [
      buildSurveyInvestment('', 50, 0),
      buildSurveyInvestment('', 50, 0)
    ]
  };
}

function getSelectedCustomRuntime() {
  return state.customRuntimes.find((runtime) => runtime.stackId === state.selectedCustomStackId) || null;
}

function saveAllCustomStacks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customRuntimes));
}

function deletePortfolioById(stackId) {
  const idx = state.customRuntimes.findIndex((runtime) => runtime.stackId === stackId);
  if (idx < 0) return;
  state.customRuntimes.splice(idx, 1);
  const fallback = state.customRuntimes[idx] || state.customRuntimes[idx - 1] || state.customRuntimes[0] || null;
  state.selectedCustomStackId = fallback ? fallback.stackId : null;
  state.activeSettings = false;
  state.deleteModalOpen = false;
  saveAllCustomStacks();
  setTab('my-stacks');
  render();
}


const stackSelectorUI = createStackSelector({
  buttonNode: nodes.stackSelectorBtn,
  menuNode: nodes.stackSelectorMenu,
  onSelect: (stackId) => {
    state.selectedCustomStackId = stackId;
    const portfolio = getSelectedCustomRuntime();
    if (portfolio) portfolio.activeCardIndex = Math.max(0, portfolio.activeCardIndex || 0);
    state.activeSettings = false;
    render();
  }
});

const stackCarouselUI = createStackCarousel({
  trackNode: nodes.stackCarouselTrack,
  prevNode: nodes.stackPrevBtn,
  nextNode: nodes.stackNextBtn,
  onActiveCardChanged: (nextIndex) => {
    const selected = getSelectedCustomRuntime();
    if (!selected) return;
    selected.activeCardIndex = nextIndex;
    render();
  },
  renderCard: (shellNode, card, index) => {
    shellNode.classList.add('card');
    const filled = card.crates.reduce((sum, crate) => sum + crate.filled, 0);
    const total = card.crates.reduce((sum, crate) => sum + crate.slotTarget, 0);
    shellNode.innerHTML = `<strong>Stack ${index + 1}</strong><p class="hint">${filled}/${total} slots filled</p>`;
  }
});

const portfolioSettingsUI = createPortfolioSettings({
  rootNode: nodes.portfolioSettingsView,
  saveNode: nodes.portfolioSettingsSave,
  cancelNode: nodes.portfolioSettingsCancel,
  deleteNode: nodes.portfolioSettingsDelete,
  addInvestmentNode: nodes.portfolioSettingsAdd,
  monthlyOptions: MONTHLY_BUDGET_OPTIONS,
  onCancel: () => {
    state.activeSettings = false;
    render();
  },
  onDeleteRequested: (stackId) => {
    if (stackId !== state.selectedCustomStackId) return;
    state.deleteModalOpen = true;
    render();
  },
  onSave: (draft) => {
    const err = StackRules.validateDraft(draft);
    if (err) return err;
    const idx = state.customRuntimes.findIndex((item) => item.stackId === draft.stackId);
    if (idx < 0) return 'Portfolio not found.';
    const prev = state.customRuntimes[idx];
    const suggestedExistingAmountsByCrateId = new Map(computeSuggestedExistingAmounts(prev).map((item) => [item.crateId, item.suggestedAmount]));
    draft.investments = draft.investments.map((investment) => ({
      ...investment,
      existingAmount: investment.existingAmount ?? suggestedExistingAmountsByCrateId.get(investment.crateId) ?? 0
    }));
    const rebuilt = StackRules.normalizeStackDraft(draft);
    const updated = toPortfolioModel(rebuilt);
    updated.cashBalance = prev.cashBalance;
    updated.waitingRoomBlocks = prev.waitingRoomBlocks;
    updated.monthCounter = prev.monthCounter;
    updated.elapsedMsInPeriod = prev.elapsedMsInPeriod;
    updated.tradingEngine = prev.tradingEngine?.log ? prev.tradingEngine : createTradingEngineState();
    updated.overflowEngine = ensureOverflowEngineCrates(prev.overflowEngine, updated.cratesTemplate);

    const nextExistingAmountByCrateId = new Map(draft.investments.map((investment) => [investment.crateId, Math.max(0, Number(investment.existingAmount || 0))]));
    reconcileExistingAmountsWithPortfolio(updated, nextExistingAmountByCrateId);

    syncPortfolioCardState(updated);
    state.customRuntimes[idx] = updated;
    state.activeSettings = false;
    saveAllCustomStacks();
    render();
    return null;
  }
});

function updateDemoTime(runtime) {
  const delta = (TICK_MS / MONTH_DURATION_MS) * 100;
  runtime.time.progress = Math.min(100, runtime.time.progress + delta);
  if (runtime.time.progress >= 100) {
    runtime.nextBlockSerial += 1;
    runtime.blocks.available.add(`${runtime.id}-cash-block-${runtime.nextBlockSerial}`);
    runtime.time.month += 1;
    runtime.time.progress = 0;
  }
}


const CRATE_RENDER_MAX_SIZE_PX = 168;
const CRATE_RENDER_MIN_SIZE_PX = 124;
const CRATE_RENDER_EDGE_GUTTER_PX = 2;
const CRATE_RENDER_GAP_PX = 4;

function renderCrateGrid(slotsNode, totalBlocks, slotStates = [], configureSlot) {
  const layout = computeCrateLayout(totalBlocks);
  const crateNode = slotsNode.closest('.crate');
  const availableWidth = crateNode
    ? crateNode.clientWidth - (CRATE_RENDER_EDGE_GUTTER_PX * 2)
    : CRATE_RENDER_MAX_SIZE_PX;
  const renderSize = Math.min(
    CRATE_RENDER_MAX_SIZE_PX,
    Math.max(CRATE_RENDER_MIN_SIZE_PX, availableWidth)
  );
  const totalGap = CRATE_RENDER_GAP_PX * Math.max(0, layout.gridSize - 1);
  const cellSize = (renderSize - totalGap) / layout.gridSize;

  slotsNode.classList.add('crate-layout-grid');
  slotsNode.style.setProperty('--grid-size', String(layout.gridSize));
  slotsNode.style.gap = `${CRATE_RENDER_GAP_PX}px`;
  slotsNode.style.width = `${renderSize}px`;
  slotsNode.style.height = `${renderSize}px`;
  slotsNode.style.gridTemplateColumns = `repeat(${layout.gridSize}, ${cellSize}px)`;
  slotsNode.style.gridTemplateRows = `repeat(${layout.gridSize}, ${cellSize}px)`;

  let slotIndex = 0;
  layout.cells.forEach((layoutCell) => {
    const cell = document.createElement('div');
    cell.className = 'slot crate-cell';
    cell.style.width = `${cellSize}px`;
    cell.style.height = `${cellSize}px`;

    const fill = document.createElement('div');
    fill.className = 'slot-fill';

    if (layoutCell.empty) {
      fill.classList.add('ghost-fill');
      fill.style.height = '100%';
    } else {
      const slot = slotStates[slotIndex] || { type: 'empty' };
      slotIndex += 1;
      if (slot.type === 'cash') {
        fill.classList.add('actual-fill', 'full-block');
        fill.style.height = '100%';
      } else if (slot.type === 'overflow') {
        fill.classList.add('overflow-fill', 'full-block');
        fill.style.height = '100%';
        fill.textContent = slot.label || '';
      } else if (slot.type === 'loading') {
        fill.classList.add('overflow-fill', 'overflow-loading');
        fill.style.height = `${Math.max(0, Math.min(100, slot.progress || 0))}%`;
        fill.textContent = slot.label || '';
      } else {
        fill.classList.add('ghost-fill');
        fill.style.height = '0%';
      }
      if (typeof configureSlot === 'function') {
        configureSlot(fill, slot);
      }
    }

    cell.append(fill);
    slotsNode.appendChild(cell);
  });
}

function flashCrateFull(node) {
  node.classList.add('full-drop');
  setTimeout(() => node.classList.remove('full-drop'), 250);
}

function getStackCashProgressPercent(stack) {
  const blockValue = normalizeBlockValue(stack.blockValue || stack.monthlyContribution);
  const elapsedRatio = Math.min(1, Math.max(0, stack.elapsedMsInPeriod / MONTH_DURATION_MS));
  const projectedCash = stack.cashBalance + (stack.monthlyContribution * elapsedRatio);
  return Math.min(100, Math.max(0, (projectedCash / blockValue) * 100));
}

const Renderer = {
  renderUnallocatedBlocks(portfolio, editable) {
    nodes.customAvailableBlocks.innerHTML = '';
    for (let i = 0; i < portfolio.waitingRoomBlocks; i += 1) {
      const block = document.createElement('div');
      block.className = 'block';
      block.draggable = editable;
      block.textContent = `$${portfolio.blockValue.toLocaleString()}`;
      if (editable) {
        block.addEventListener('dragstart', (event) => {
          event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'cash' }));
        });
      }
      nodes.customAvailableBlocks.appendChild(block);
    }
  },

  renderCrates(crates, portfolio, editable) {
    nodes.customCrateGrid.innerHTML = '';
    crates.forEach((crate) => {
      const node = nodes.crateTemplate.content.firstElementChild.cloneNode(true);
      const crateStats = getCrateBlocksAndOverflow(crate, portfolio.blockValue);
      node.querySelector('.crate-label').textContent = crate.name;
      node.querySelector('.crate-count').textContent = `${crateStats.fullBlocks}/${crate.slotTarget}`;
      const slots = node.querySelector('.slots');
      const slotStates = [];
      for (let i = 0; i < crateStats.fullBlocks; i += 1) slotStates.push({ type: 'cash' });
      while (slotStates.length < crate.slotTarget) slotStates.push({ type: 'empty' });
      const firstEmpty = slotStates.findIndex((slot) => slot.type === 'empty');
      if (firstEmpty >= 0 && crateStats.overflowPercent > 0.01) {
        slotStates[firstEmpty] = { type: 'loading', progress: crateStats.overflowPercent, label: crate.name };
      }

      renderCrateGrid(slots, crate.slotTarget, slotStates, (fillNode, slot) => {
        if (!editable) return;
        if (slot.type === 'cash') {
          fillNode.draggable = true;
          fillNode.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'full-block', fromCrateId: crate.crateId }));
          });
        }
      });

      const rate = portfolio.cratesTemplate.find((entry) => entry.crateId === crate.crateId)?.overflowRatePerMinute ?? 1;
      const summary = document.createElement('p');
      summary.className = 'crate-meta';
      summary.textContent = `Value $${crateStats.value.toFixed(2)} · Requested ${crate.requestedPercent.toFixed(1)}% · Overflow ${crateStats.overflowPercent.toFixed(1)}% · Rate ${Number(rate).toFixed(2)}/min`;
      node.appendChild(summary);

      if (editable) {
        node.addEventListener('dragover', (event) => {
          event.preventDefault();
          node.classList.add('over');
        });
        node.addEventListener('dragleave', () => node.classList.remove('over'));
        node.addEventListener('drop', (event) => {
          event.preventDefault();
          node.classList.remove('over');
          const payload = JSON.parse(event.dataTransfer.getData('text/plain') || '{}');
          let ok = false;
          if (payload.type === 'cash') ok = StackEngine.allocateBlockToCrate(portfolio, crate.crateId);
          if (payload.type === 'full-block') ok = StackEngine.moveFullBlock(portfolio, payload.fromCrateId, crate.crateId);
          if (!ok) flashCrateFull(node);
          saveAllCustomStacks();
          render();
        });
      }

      nodes.customCrateGrid.appendChild(node);
    });
  },

  renderStackView(portfolio, card, cardIndex) {
    const editable = cardIndex === portfolio.activeCardIndex;
    const progress = getStackCashProgressPercent(portfolio);
    nodes.customMonthIndicator.textContent = `Simulator Month ${portfolio.monthCounter}`;
    nodes.customCashFill.style.width = `${progress}%`;
    nodes.customCashPercent.textContent = `${Math.round(progress)}%`;

    const totalSlots = card.crates.reduce((sum, crate) => sum + crate.slotTarget, 0);
    const filledSlots = card.crates.reduce((sum, crate) => sum + getCrateBlocksAndOverflow(crate, portfolio.blockValue).fullBlocks, 0);
    const flowRates = getMoneyFlowRates(portfolio);

    nodes.customCashStatus.textContent = portfolio.waitingRoomBlocks > 0
      ? `${portfolio.waitingRoomBlocks} Waiting Room Block${portfolio.waitingRoomBlocks > 1 ? 's' : ''}`
      : `Cash balance: $${portfolio.cashBalance.toFixed(2)}`;
    nodes.customStackFill.textContent = `${filledSlots} / ${totalSlots} slots filled · Cash mint ${flowRates.cashMintRatePerMinute}/min`;
    nodes.customWaitingRoomCount.textContent = `${portfolio.waitingRoomBlocks}`;
    nodes.customCashBalance.textContent = `$${portfolio.cashBalance.toFixed(2)}`;
    nodes.customCompletedStacks.textContent = `${portfolio.completedStacks}`;
    nodes.stackCardMeta.textContent = `Stack ${cardIndex + 1}`;

    Renderer.renderUnallocatedBlocks(portfolio, editable);
    Renderer.renderCrates(card.crates, portfolio, editable);
    renderTradeLog(nodes.tradeLog, portfolio.tradingEngine?.log || []);
  }
};

function renderDemo() {
  const runtime = state.demo;
  nodes.monthIndicator.textContent = `Simulator Month ${runtime.time.month}`;
  nodes.cashFill.style.width = `${runtime.time.progress}%`;
  nodes.cashPercent.textContent = `${Math.round(runtime.time.progress)}%`;
  nodes.cashStatus.textContent = runtime.blocks.available.size > 0 ? `${runtime.blocks.available.size} Cash Block${runtime.blocks.available.size > 1 ? 's' : ''} Ready` : 'Filling...';

  nodes.availableBlocks.innerHTML = '';
  runtime.blocks.available.forEach((blockId) => {
    const block = document.createElement('div');
    block.className = 'block';
    block.id = blockId;
    block.draggable = true;
    block.textContent = `$${runtime.monthlyContribution.toLocaleString()}`;
    block.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', block.id));
    nodes.availableBlocks.appendChild(block);
  });

  nodes.crateGrid.innerHTML = '';
  runtime.crates.forEach((crate) => {
    const node = nodes.crateTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.crate-label').textContent = crate.name;
    node.querySelector('.crate-count').textContent = `${crate.blocksFilled}/${crate.capacity}`;
    const slots = node.querySelector('.slots');
    const slotStates = [];
    for (let i = 0; i < crate.blocksFilled; i += 1) slotStates.push({ type: 'cash' });
    while (slotStates.length < crate.capacity) slotStates.push({ type: 'empty' });
    renderCrateGrid(slots, crate.capacity, slotStates);

    node.addEventListener('dragover', (event) => { if (crate.blocksFilled < crate.capacity) event.preventDefault(); });
    node.addEventListener('drop', (event) => {
      const blockId = event.dataTransfer.getData('text/plain');
      if (!runtime.blocks.available.has(blockId) || crate.blocksFilled >= crate.capacity) return;
      crate.blocksFilled += 1;
      runtime.blocks.available.delete(blockId);
      render();
    });

    nodes.crateGrid.appendChild(node);
  });
}

const SURVEY_TOTAL_STEPS = 4;
const SURVEY_TRANSITION_MS = 280;


function setModalPageScrollLock(isLocked) {
  document.body.classList.toggle('modal-open', isLocked);
}

function ensureFieldVisibleInSurvey(field) {
  if (!field || !nodes.surveyBody) return;
  requestAnimationFrame(() => {
    field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

const SurveyUI = {
  lastRenderedStep: 1,

  openCreateSurvey() {
    state.survey = { open: true, mode: 'create', step: 1, editingId: null, values: getEmptySurveyValues() };
    SurveyUI.lastRenderedStep = 1;
    SurveyUI.renderSurvey({ animate: false });
  },

  openEditSurvey() {
    const stack = getSelectedCustomRuntime();
    if (!stack) return;
    state.survey = {
      open: true,
      mode: 'edit',
      step: 1,
      editingId: stack.stackId,
      values: {
        stackName: stack.stackName,
        monthlyContribution: stack.monthlyContribution,
        investments: stack.cratesTemplate.map((crate) => ({
          ...buildSurveyInvestment(
            crate.name,
            crate.requestedPercent,
            Number(crate.existingAmount || 0),
            crate.crateId
          ),
          filled: crate.filled
        }))
      }
    };
    SurveyUI.lastRenderedStep = 1;
    SurveyUI.renderSurvey({ animate: false });
  },

  cancelSurvey() {
    state.survey.open = false;
    nodes.surveyModal.classList.add('hidden');
    setModalPageScrollLock(false);
    render();
  },

  goBack() {
    if (state.survey.step <= 1) return SurveyUI.cancelSurvey();
    state.survey.step -= 1;
    SurveyUI.renderSurvey();
  },

  getStepValidity() {
    const values = state.survey.values;

    if (state.survey.step === 1) {
      return Boolean((values.stackName || '').trim());
    }

    if (state.survey.step === 2) {
      return MONTHLY_BUDGET_OPTIONS.includes(values.monthlyContribution);
    }

    if (state.survey.step === 3) {
      const named = values.investments
        .map((item) => ({
          name: item.name.trim(),
          crateId: item.crateId,
          targetPercent: Number(item.targetPercent || 0),
          existingAmount: Math.max(0, Number(item.existingAmount || 0)),
          filled: item.filled
        }))
        .filter((item) => item.name);
      if (named.length < 2 || named.length > 20) return false;
      const totalPercent = named.reduce((sum, item) => sum + Number(item.targetPercent || 0), 0);
      return Math.abs(totalPercent - 100) <= 0.01;
    }

    return true;
  },

  updateWizardChrome() {
    nodes.surveyModal.classList.toggle('hidden', !state.survey.open);
    setModalPageScrollLock(state.survey.open);
    nodes.surveyBack.style.visibility = state.survey.step === 1 ? 'hidden' : 'visible';
    nodes.surveyNext.textContent = state.survey.step === SURVEY_TOTAL_STEPS ? 'Save Stack' : 'Continue';
    nodes.surveyStepLabel.textContent = `Step ${state.survey.step} of ${SURVEY_TOTAL_STEPS}`;
    nodes.surveyProgressFill.style.width = `${(state.survey.step / SURVEY_TOTAL_STEPS) * 100}%`;
    nodes.surveyNext.disabled = !SurveyUI.getStepValidity();
  },

  renderSurvey(options = {}) {
    const { animate = true } = options;
    const values = state.survey.values;
    nodes.surveyError.textContent = '';
    SurveyUI.updateWizardChrome();
    if (nodes.surveyBody) nodes.surveyBody.scrollTop = 0;

    const stage = document.createElement('div');
    stage.className = 'survey-stage';

    if (state.survey.step === 1) {
      nodes.surveyQuestion.textContent = 'What would you like to name this stack?';
      stage.innerHTML = `<input id="stackNameInput" class="field" type="text" value="${values.stackName}" autocomplete="off" placeholder="My Long-Term Stack">`;
    } else if (state.survey.step === 2) {
      const presets = MONTHLY_BUDGET_OPTIONS.map((amount) => `<button class="preset ${values.monthlyContribution === amount ? 'selected' : ''}" data-amount="${amount}" type="button">$${amount.toLocaleString()}</button>`).join('');
      nodes.surveyQuestion.textContent = 'How much can you save per month?';
      stage.innerHTML = `<div class="preset-wrap">${presets}</div><p class="survey-note">1 block mints each simulator month. Block value matches your monthly savings.</p>`;
    } else if (state.survey.step === 3) {
      nodes.surveyQuestion.textContent = 'Add your investments, target %, and existing amount (2-20).';
      stage.innerHTML = `<div>${values.investments.map((row, idx) => `<div class="investment-row"><input class="field inv-name" data-index="${idx}" type="text" placeholder="Investment name" value="${row.name}"><input class="field inv-pct" data-index="${idx}" type="text" inputmode="decimal" value="${row.percentInput ?? formatPercentForInput(row.targetPercent)}"><input class="field inv-existing" data-index="${idx}" type="number" min="0" step="1" value="${Math.max(0, Number(row.existingAmount || 0))}" placeholder="Existing amount"></div>`).join('')}</div><button id="addInvestment" class="btn btn-soft" type="button" ${values.investments.length >= 20 ? 'disabled' : ''}>Add Investment</button>`;
    } else {
      const named = values.investments
        .map((item) => ({
          name: item.name.trim(),
          crateId: item.crateId,
          targetPercent: Number(item.targetPercent || 0),
          existingAmount: Math.max(0, Number(item.existingAmount || 0)),
          filled: item.filled
        }))
        .filter((item) => item.name);
      const tempStack = StackRules.normalizeStackDraft({
        stackName: values.stackName,
        monthlyContribution: values.monthlyContribution,
        investments: named
      });

      nodes.surveyQuestion.textContent = 'Confirm full stack layout';
      stage.innerHTML = `<p class="survey-note">Full stack requires ${tempStack.fullStackSize} blocks.</p><p class="survey-note">Block value: $${tempStack.blockValue.toLocaleString()}</p><div>${tempStack.crates.map((crate) => `<p class="survey-note"><strong>${crate.name}</strong> · Requested ${crate.requestedPercent.toFixed(1)}% → Slots: ${crate.slotTarget}</p>`).join('')}</div>`;
    }

    const current = nodes.surveyContent.querySelector('.survey-stage');
    const stepDelta = state.survey.step - SurveyUI.lastRenderedStep;

    if (current && animate) {
      current.classList.add('is-exiting');
      stage.classList.add('is-entering');
      nodes.surveyContent.appendChild(stage);
      requestAnimationFrame(() => stage.classList.remove('is-entering'));
      setTimeout(() => current.remove(), SURVEY_TRANSITION_MS);
    } else {
      nodes.surveyContent.innerHTML = '';
      nodes.surveyContent.appendChild(stage);
    }

    SurveyUI.lastRenderedStep = state.survey.step;

    const nameInput = stage.querySelector('#stackNameInput');
    if (nameInput) {
      nameInput.focus();
      nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
      nameInput.addEventListener('input', (event) => {
        values.stackName = event.target.value;
        nodes.surveyNext.disabled = !SurveyUI.getStepValidity();
      });
    }

    stage.querySelectorAll('.preset').forEach((btn) => btn.addEventListener('click', () => {
      values.monthlyContribution = Number(btn.dataset.amount);
      SurveyUI.renderSurvey({ animate: false });
    }));

    stage.querySelectorAll('.inv-name').forEach((input) => input.addEventListener('input', (event) => {
      values.investments[Number(event.target.dataset.index)].name = event.target.value;
      nodes.surveyNext.disabled = !SurveyUI.getStepValidity();
    }));

    stage.querySelectorAll('.inv-pct').forEach((input) => input.addEventListener('input', (event) => {
      const idx = Number(event.target.dataset.index);
      const didNormalize = normalizeManualPercentChange(values.investments, idx, event.target.value);
      if (!didNormalize) {
        nodes.surveyNext.disabled = !SurveyUI.getStepValidity();
        return;
      }

      stage.querySelectorAll('.inv-pct').forEach((pctInput) => {
        const fieldIndex = Number(pctInput.dataset.index);
        if (fieldIndex === idx) return;
        pctInput.value = formatPercentForInput(values.investments[fieldIndex].targetPercent);
      });
      nodes.surveyNext.disabled = !SurveyUI.getStepValidity();
    }));

    stage.querySelectorAll('.inv-pct').forEach((input) => input.addEventListener('blur', (event) => {
      const idx = Number(event.target.dataset.index);
      values.investments[idx].percentInput = formatPercentForInput(values.investments[idx].targetPercent);
      event.target.value = values.investments[idx].percentInput;
    }));

    stage.querySelectorAll('.inv-existing').forEach((input) => input.addEventListener('input', (event) => {
      const idx = Number(event.target.dataset.index);
      values.investments[idx].existingAmount = Math.max(0, Number(event.target.value || 0));
    }));

    const addBtn = stage.querySelector('#addInvestment');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (values.investments.length >= 20) return;
        const n = values.investments.length + 1;
        values.investments.push(buildSurveyInvestment('', 100 / n, 0));
        values.investments.forEach((item) => {
          item.percentManual = false;
          item.targetPercent = 100 / n;
          item.percentInput = formatPercentForInput(item.targetPercent);
        });
        autoDistributeAll(values.investments);
        SurveyUI.renderSurvey({ animate: false });
      });
    }

    if (animate && stepDelta < 0 && current) {
      stage.style.transform = 'translateX(-20px) scale(0.98)';
      stage.style.opacity = '0';
      requestAnimationFrame(() => {
        stage.style.transform = '';
        stage.style.opacity = '';
      });
    }

    nodes.surveyNext.disabled = !SurveyUI.getStepValidity();
  },

  validateAndAdvanceSurvey() {
    const values = state.survey.values;
    nodes.surveyError.textContent = '';

    if (state.survey.step === 1) {
      const name = document.getElementById('stackNameInput').value.trim();
      if (!name) return void (nodes.surveyError.textContent = 'Stack name is required.');
      values.stackName = name;
      state.survey.step += 1;
      return SurveyUI.renderSurvey();
    }

    if (state.survey.step === 2) {
      if (!MONTHLY_BUDGET_OPTIONS.includes(values.monthlyContribution)) return void (nodes.surveyError.textContent = 'Choose a monthly contribution option.');
      state.survey.step += 1;
      return SurveyUI.renderSurvey();
    }

    if (state.survey.step === 3) {
      const named = values.investments
        .map((item) => ({
          name: item.name.trim(),
          crateId: item.crateId,
          targetPercent: Number(item.targetPercent || 0),
          existingAmount: Math.max(0, Number(item.existingAmount || 0)),
          filled: item.filled
        }))
        .filter((item) => item.name);
      if (named.length < 2 || named.length > 20) return void (nodes.surveyError.textContent = 'Add between 2 and 20 investment names.');
      const totalPercent = named.reduce((sum, item) => sum + Number(item.targetPercent || 0), 0);
      if (Math.abs(totalPercent - 100) > 0.01) return void (nodes.surveyError.textContent = 'Allocation percentages must total 100%.');
      values.investments = named;
      state.survey.step += 1;
      return SurveyUI.renderSurvey();
    }

    const draft = {
      stackId: state.survey.mode === 'edit' ? state.survey.editingId : undefined,
      stackName: values.stackName,
      monthlyContribution: values.monthlyContribution,
      investments: values.investments
    };

    const err = StackRules.validateDraft(draft);
    if (err) return void (nodes.surveyError.textContent = err);

    const built = StackRules.normalizeStackDraft(draft);
    if (state.survey.mode === 'edit') {
      const existing = getSelectedCustomRuntime();
      built.cashBalance = existing ? existing.cashBalance : 0;
      built.waitingRoomBlocks = existing ? existing.waitingRoomBlocks : 0;
      built.completedStacks = existing ? existing.completedStacks : 0;
      built.monthCounter = existing ? existing.monthCounter : 1;
      built.elapsedMsInPeriod = existing ? existing.elapsedMsInPeriod : 0;

      const existingById = new Map((existing ? existing.crates : []).map((crate) => [crate.crateId, crate]));
      built.crates.forEach((crate) => {
        const old = existingById.get(crate.crateId);
        if (!old) return;
        crate.filled = Math.min(old.filled ?? old.blocksFilled ?? 0, crate.slotTarget);
      });

      const idx = state.customRuntimes.findIndex((stack) => stack.stackId === built.stackId);
      if (idx >= 0) {
        const updated = toPortfolioModel(built);
        syncPortfolioCardState(updated);
        state.customRuntimes[idx] = updated;
      }
    } else {
      const created = toPortfolioModel(built);
      syncPortfolioCardState(created);
      state.customRuntimes.push(created);
    }

    state.selectedCustomStackId = built.stackId;
    state.activeSettings = false;
    saveAllCustomStacks();
    state.survey.open = false;
    nodes.surveyModal.classList.add('hidden');
    setModalPageScrollLock(false);
    render();
  }
};

function openCreateSurvey() { SurveyUI.openCreateSurvey(); }
function openEditSurvey() {
  state.activeSettings = true;
  render();
}

function setTab(tab) {
  state.activeTab = tab;
  nodes.tabDemo.classList.toggle('is-active', tab === 'demo');
  nodes.tabMyStacks.classList.toggle('is-active', tab === 'my-stacks');
  nodes.demoView.classList.toggle('hidden', tab !== 'demo');
  nodes.myStacksView.classList.toggle('hidden', tab !== 'my-stacks');
}

function render() {
  renderDemo();
  stackSelectorUI.setData(state.customRuntimes, state.selectedCustomStackId);

  const selected = getSelectedCustomRuntime();
  if (!selected) {
    state.deleteModalOpen = false;
    nodes.deletePortfolioModal.classList.add('hidden');
    nodes.customStackWorkspace.classList.add('hidden');
    nodes.portfolioSettingsView.classList.add('hidden');
    nodes.openSettingsBtn.disabled = true;
    return;
  }

  syncPortfolioCardState(selected);
  nodes.openSettingsBtn.disabled = false;
  if (state.activeSettings) {
    nodes.customStackWorkspace.classList.add('hidden');
    nodes.portfolioSettingsView.classList.remove('hidden');
    const suggestedExistingAmountsByCrateId = new Map(computeSuggestedExistingAmounts(selected).map((item) => [item.crateId, item.suggestedAmount]));
    portfolioSettingsUI.load(selected, getQuickProgressReport(selected), suggestedExistingAmountsByCrateId);
  } else {
    nodes.portfolioSettingsView.classList.add('hidden');
    nodes.customStackWorkspace.classList.remove('hidden');
    nodes.customCashTitle.textContent = `${selected.stackName} Waiting Room`;
    const hasStackHistory = selected.stackCards.length > 1;
    nodes.stackNavShell.classList.toggle('hidden', !hasStackHistory);
    stackCarouselUI.setCards(selected.stackCards, selected.activeCardIndex || 0);
    const card = getActiveStackCard(selected);
    if (card) Renderer.renderStackView(selected, card, selected.activeCardIndex || 0);
  }

  nodes.deletePortfolioModal.classList.toggle('hidden', !state.deleteModalOpen);


}

function tick() {
  updateDemoTime(state.demo);
  state.customRuntimes.forEach((stack) => {
    StackEngine.tickStack(stack);
    syncPortfolioCardState(stack);
  });
  saveAllCustomStacks();
  render();
}

nodes.tabDemo.addEventListener('click', () => setTab('demo'));
nodes.tabMyStacks.addEventListener('click', () => setTab('my-stacks'));
nodes.createStackBtn.addEventListener('click', openCreateSurvey);
nodes.openSettingsBtn.addEventListener('click', () => {
  if (!getSelectedCustomRuntime()) return;
  state.activeSettings = true;
  render();
});
nodes.editStackBtn.addEventListener('click', openEditSurvey);
nodes.deletePortfolioCancel.addEventListener('click', () => {
  state.deleteModalOpen = false;
  render();
});
nodes.deletePortfolioConfirm.addEventListener('click', () => {
  const selected = getSelectedCustomRuntime();
  if (!selected) return;
  deletePortfolioById(selected.stackId);
});
nodes.surveyClose.addEventListener('click', () => SurveyUI.cancelSurvey());
nodes.surveyCancel.addEventListener('click', (event) => {
  event.preventDefault();
  SurveyUI.cancelSurvey();
});
nodes.surveyBack.addEventListener('click', () => SurveyUI.goBack());
nodes.surveyNext.addEventListener('click', () => SurveyUI.validateAndAdvanceSurvey());


nodes.surveyModal.addEventListener('focusin', (event) => {
  if (!state.survey.open) return;
  if (!(event.target instanceof HTMLElement)) return;
  if (!event.target.matches('input, select, textarea')) return;
  ensureFieldVisibleInSurvey(event.target);
});

document.addEventListener('keydown', (event) => {
  if (!state.survey.open) return;

  if (event.key === 'Enter' && SurveyUI.getStepValidity()) {
    event.preventDefault();
    SurveyUI.validateAndAdvanceSurvey();
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    SurveyUI.goBack();
  }
});

state.customRuntimes = StackStorage.loadStacks();
if (state.customRuntimes[0]) state.selectedCustomStackId = state.customRuntimes[0].stackId;
render();
setInterval(tick, TICK_MS);
