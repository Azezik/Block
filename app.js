const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;
const STORAGE_KEY = 'block.custom.stacks.v5';
const LEGACY_STORAGE_KEY = 'block.custom.stacks.v3';
const MONTHLY_BUDGET_OPTIONS = [100, 250, 500, 750, 1000];
const MAX_STACK_SLOTS = 24;

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
  customCrateGrid: document.getElementById('customCrateGrid'),
  customStackWorkspace: document.getElementById('customStackWorkspace'),
  customCashTitle: document.getElementById('customCashTitle'),
  customBoardTitle: document.getElementById('customBoardTitle'),
  customStackFill: document.getElementById('customStackFill'),
  customWaitingRoomCount: document.getElementById('customWaitingRoomCount'),
  customCashBalance: document.getElementById('customCashBalance'),
  customCompletedStacks: document.getElementById('customCompletedStacks'),
  stacksList: document.getElementById('stacksList'),
  createStackBtn: document.getElementById('createStackBtn'),
  editStackBtn: document.getElementById('editStackBtn'),
  surveyModal: document.getElementById('surveyModal'),
  surveyQuestion: document.getElementById('surveyQuestion'),
  surveyContent: document.getElementById('surveyContent'),
  surveyError: document.getElementById('surveyError'),
  surveyBack: document.getElementById('surveyBack'),
  surveyNext: document.getElementById('surveyNext'),
  crateTemplate: document.getElementById('crateTemplate')
};

function normalizePercentDraft(investments, changedIndex, changedPercent) {
  const bounded = Math.max(0, Math.min(100, changedPercent));
  const totalOther = investments.reduce((sum, item, idx) => sum + (idx === changedIndex ? 0 : item.targetPercent), 0);
  const targetOther = 100 - bounded;
  if (investments.length === 1) {
    investments[0].targetPercent = 100;
    return;
  }

  if (totalOther <= 0) {
    const even = targetOther / (investments.length - 1);
    investments.forEach((item, idx) => {
      item.targetPercent = idx === changedIndex ? bounded : even;
    });
  } else {
    investments.forEach((item, idx) => {
      if (idx === changedIndex) item.targetPercent = bounded;
      else item.targetPercent = (item.targetPercent / totalOther) * targetOther;
    });
  }

  const rawTotal = investments.reduce((sum, item) => sum + item.targetPercent, 0);
  investments[investments.length - 1].targetPercent += (100 - rawTotal);
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

  return best || { totalSlots: crateCount, slots: Array(crateCount).fill(1) };
}

function calculateTargets(stack) {
  stack.blockValue = Number(stack.monthlyContribution);
  const slotPlan = computeSlotTargets(stack.crates);
  stack.fullStackSize = slotPlan.totalSlots;

  stack.crates.forEach((crate, idx) => {
    crate.slotTarget = slotPlan.slots[idx];
    const legacyFilled = Number(crate.filled ?? crate.blocksFilled ?? crate.plannedBlocksFilled ?? 0) + Number(crate.extraBlocksFilled || 0);
    crate.filled = Math.max(0, Math.min(legacyFilled, crate.slotTarget));
  });

  return stack;
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
          filled: Number(item.filled ?? item.blocksFilled ?? item.plannedBlocksFilled ?? 0)
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
            filled: Number(crate.filled ?? crate.blocksFilled ?? (legacyPlanned + legacyExtra))
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
      return parsed.map((stack) => StackRules.normalizeLoadedStack(stack));
    } catch {
      return [];
    }
  }
};

function checkAndResetCompletedStack(stack) {
  const isFull = stack.crates.every((crate) => crate.filled === crate.slotTarget);
  if (!isFull) return;
  stack.completedStacks += 1;
  stack.crates.forEach((crate) => { crate.filled = 0; });
}

const StackEngine = {
  tickStack(stack) {
    stack.elapsedMsInPeriod += TICK_MS;
    while (stack.elapsedMsInPeriod >= MONTH_DURATION_MS) {
      stack.monthCounter += 1;
      stack.cashBalance += stack.monthlyContribution;
      stack.elapsedMsInPeriod -= MONTH_DURATION_MS;
      while (stack.cashBalance >= stack.blockValue) {
        stack.waitingRoomBlocks += 1;
        stack.cashBalance -= stack.blockValue;
      }
    }
  },

  assignBlock(crate) {
    if (crate.filled >= crate.slotTarget) return false;
    crate.filled += 1;
    return true;
  },

  removeBlock(crate) {
    if (crate.filled <= 0) return false;
    crate.filled -= 1;
    return true;
  },

  allocateBlockToCrate(stack, crateId) {
    if (stack.waitingRoomBlocks <= 0) return false;
    const crate = stack.crates.find((entry) => entry.crateId === crateId);
    if (!crate) return false;
    const assigned = StackEngine.assignBlock(crate);
    if (!assigned) return false;
    stack.waitingRoomBlocks -= 1;
    checkAndResetCompletedStack(stack);
    return true;
  },

  moveFullBlock(stack, fromCrateId, toCrateId) {
    if (fromCrateId === toCrateId) return false;
    const from = stack.crates.find((item) => item.crateId === fromCrateId);
    const to = stack.crates.find((item) => item.crateId === toCrateId);
    if (!from || !to || to.filled >= to.slotTarget) return false;
    const moved = StackEngine.removeBlock(from);
    if (!moved) return false;
    StackEngine.assignBlock(to);
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
    investments: [{ name: '', targetPercent: 50 }, { name: '', targetPercent: 50 }]
  };
}

function getSelectedCustomRuntime() {
  return state.customRuntimes.find((runtime) => runtime.stackId === state.selectedCustomStackId) || null;
}

function saveAllCustomStacks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customRuntimes));
}

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

function flashCrateFull(node) {
  node.classList.add('full-drop');
  setTimeout(() => node.classList.remove('full-drop'), 250);
}

function getStackCashProgressPercent(stack) {
  const elapsedRatio = Math.min(1, Math.max(0, stack.elapsedMsInPeriod / MONTH_DURATION_MS));
  const projectedCash = stack.cashBalance + (stack.monthlyContribution * elapsedRatio);
  return Math.min(100, Math.max(0, (projectedCash / stack.blockValue) * 100));
}

const Renderer = {
  renderUnallocatedBlocks(stack) {
    nodes.customAvailableBlocks.innerHTML = '';
    for (let i = 0; i < stack.waitingRoomBlocks; i += 1) {
      const block = document.createElement('div');
      block.className = 'block';
      block.draggable = true;
      block.textContent = `$${stack.blockValue.toLocaleString()}`;
      block.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'cash' }));
      });
      nodes.customAvailableBlocks.appendChild(block);
    }
  },

  renderCrates(crates, stack) {
    nodes.customCrateGrid.innerHTML = '';
    crates.forEach((crate) => {
      const node = nodes.crateTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('.crate-label').textContent = crate.name;
      node.querySelector('.crate-count').textContent = `${crate.filled}/${crate.slotTarget}`;
      const slots = node.querySelector('.slots');
      slots.classList.add('stack-layers');

      for (let i = 0; i < Math.max(1, crate.slotTarget); i += 1) {
        const cell = document.createElement('div');
        cell.className = 'slot layer-slot';
        const ghost = document.createElement('div');
        ghost.className = 'slot-fill ghost-fill';
        ghost.style.height = '100%';

        const actual = document.createElement('div');
        actual.className = 'slot-fill actual-fill';
        actual.style.height = `${i < crate.filled ? 100 : 0}%`;

        if (i < crate.filled) {
          actual.classList.add('full-block');
          actual.draggable = true;
          actual.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'full-block', fromCrateId: crate.crateId }));
          });
        }

        cell.append(ghost, actual);
        slots.appendChild(cell);
      }

      const summary = document.createElement('p');
      summary.className = 'crate-meta';
      summary.textContent = `Requested ${crate.requestedPercent.toFixed(1)}% · Slots ${crate.slotTarget} · Filled ${crate.filled}/${crate.slotTarget}`;
      node.appendChild(summary);

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
        if (payload.type === 'cash') ok = StackEngine.allocateBlockToCrate(stack, crate.crateId);
        if (payload.type === 'full-block') ok = StackEngine.moveFullBlock(stack, payload.fromCrateId, crate.crateId);
        if (!ok) flashCrateFull(node);
        saveAllCustomStacks();
        render();
      });

      nodes.customCrateGrid.appendChild(node);
    });
  },

  renderStackView(stack) {
    const progress = getStackCashProgressPercent(stack);
    nodes.customMonthIndicator.textContent = `Simulator Month ${stack.monthCounter}`;
    nodes.customCashFill.style.width = `${progress}%`;
    nodes.customCashPercent.textContent = `${Math.round(progress)}%`;

    const totalSlots = stack.crates.reduce((sum, crate) => sum + crate.slotTarget, 0);
    const filledSlots = stack.crates.reduce((sum, crate) => sum + crate.filled, 0);

    nodes.customCashStatus.textContent = stack.waitingRoomBlocks > 0
      ? `${stack.waitingRoomBlocks} Waiting Room Block${stack.waitingRoomBlocks > 1 ? 's' : ''}`
      : `Cash balance: $${stack.cashBalance.toFixed(2)}`;
    nodes.customStackFill.textContent = `${filledSlots} / ${totalSlots}`;
    nodes.customWaitingRoomCount.textContent = `${stack.waitingRoomBlocks}`;
    nodes.customCashBalance.textContent = `$${stack.cashBalance.toFixed(2)}`;
    nodes.customCompletedStacks.textContent = `${stack.completedStacks}`;

    Renderer.renderUnallocatedBlocks(stack);
    Renderer.renderCrates(stack.crates, stack);
  },

  renderMyStacks(stacks) {
    nodes.stacksList.innerHTML = '';
    if (!stacks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-msg';
      empty.innerHTML = 'No stacks yet. <button class="inline-link" id="buildOwn" type="button">Build your own?</button>';
      nodes.stacksList.appendChild(empty);
      document.getElementById('buildOwn').addEventListener('click', openCreateSurvey);
      nodes.customStackWorkspace.classList.add('hidden');
      return;
    }

    stacks.forEach((stack) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `stack-card ${stack.stackId === state.selectedCustomStackId ? 'selected' : ''}`;
      card.innerHTML = `<strong>${stack.stackName}</strong><span>Block Value: $${stack.blockValue}</span><span>Full Stack Size: ${stack.fullStackSize} blocks</span><span>Completed Stacks: ${stack.completedStacks}</span>`;
      card.addEventListener('click', () => { state.selectedCustomStackId = stack.stackId; render(); });
      nodes.stacksList.appendChild(card);
    });
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

    for (let i = 0; i < crate.capacity; i += 1) {
      const slot = document.createElement('div');
      slot.className = `slot ${i < crate.blocksFilled ? 'filled' : ''}`;
      slots.appendChild(slot);
    }

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

const SurveyUI = {
  openCreateSurvey() {
    state.survey = { open: true, mode: 'create', step: 1, editingId: null, values: getEmptySurveyValues() };
    SurveyUI.renderSurvey();
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
        investments: stack.crates.map((crate) => ({
          name: crate.name,
          crateId: crate.crateId,
          targetPercent: crate.requestedPercent,
          filled: crate.filled
        }))
      }
    };
    SurveyUI.renderSurvey();
  },

  renderSurvey() {
    const values = state.survey.values;
    nodes.surveyModal.classList.toggle('hidden', !state.survey.open);
    nodes.surveyError.textContent = '';
    nodes.surveyBack.style.visibility = state.survey.step === 1 ? 'hidden' : 'visible';
    nodes.surveyNext.textContent = state.survey.step === 4 ? 'Save Stack' : 'Save / Continue';

    if (state.survey.step === 1) {
      nodes.surveyQuestion.textContent = 'What would you like to name this stack?';
      nodes.surveyContent.innerHTML = `<input id="stackNameInput" class="field" type="text" value="${values.stackName}">`;
      return;
    }

    if (state.survey.step === 2) {
      const presets = MONTHLY_BUDGET_OPTIONS.map((amount) => `<button class="preset ${values.monthlyContribution === amount ? 'selected' : ''}" data-amount="${amount}" type="button">$${amount.toLocaleString()}</button>`).join('');
      nodes.surveyQuestion.textContent = 'How much can you save per month?';
      nodes.surveyContent.innerHTML = `<div class="preset-wrap">${presets}</div><p class="survey-note">1 block mints each simulator month. Block value matches your monthly savings.</p>`;
      nodes.surveyContent.querySelectorAll('.preset').forEach((btn) => btn.addEventListener('click', () => { values.monthlyContribution = Number(btn.dataset.amount); SurveyUI.renderSurvey(); }));
      return;
    }

    if (state.survey.step === 3) {
      nodes.surveyQuestion.textContent = 'Add your investments and target % (2-20).';
      nodes.surveyContent.innerHTML = `<div>${values.investments.map((row, idx) => `<div class="investment-row"><input class="field inv-name" data-index="${idx}" type="text" placeholder="Investment name" value="${row.name}"><input class="field inv-pct" data-index="${idx}" type="number" min="0" max="100" step="0.1" value="${Number(row.targetPercent || 0).toFixed(1)}"></div>`).join('')}</div><button id="addInvestment" class="btn btn-soft" type="button" ${values.investments.length >= 20 ? 'disabled' : ''}>Add Investment</button>`;
      nodes.surveyContent.querySelectorAll('.inv-name').forEach((input) => input.addEventListener('input', (event) => {
        values.investments[Number(event.target.dataset.index)].name = event.target.value;
      }));
      nodes.surveyContent.querySelectorAll('.inv-pct').forEach((input) => input.addEventListener('input', (event) => {
        const idx = Number(event.target.dataset.index);
        normalizePercentDraft(values.investments, idx, Number(event.target.value));
        SurveyUI.renderSurvey();
      }));
      const addBtn = document.getElementById('addInvestment');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          if (values.investments.length >= 20) return;
          const n = values.investments.length + 1;
          values.investments.push({ name: '', targetPercent: 100 / n });
          values.investments.forEach((item) => { item.targetPercent = 100 / n; });
          SurveyUI.renderSurvey();
        });
      }
      return;
    }

    const named = values.investments.map((item) => ({ ...item, name: item.name.trim() })).filter((item) => item.name);
    const tempStack = StackRules.normalizeStackDraft({
      stackName: values.stackName,
      monthlyContribution: values.monthlyContribution,
      investments: named
    });

    nodes.surveyQuestion.textContent = 'Confirm full stack layout';
    nodes.surveyContent.innerHTML = `<p class="survey-note">Full stack requires ${tempStack.fullStackSize} blocks.</p><p class="survey-note">Block value: $${tempStack.blockValue.toLocaleString()}</p><div>${tempStack.crates.map((crate) => `<p class="survey-note"><strong>${crate.name}</strong> · Requested ${crate.requestedPercent.toFixed(1)}% → Slots: ${crate.slotTarget}</p>`).join('')}</div>`;
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
      const named = values.investments.map((item) => ({ ...item, name: item.name.trim() })).filter((item) => item.name);
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
      if (idx >= 0) state.customRuntimes[idx] = built;
    } else {
      state.customRuntimes.push(built);
    }

    state.selectedCustomStackId = built.stackId;
    saveAllCustomStacks();
    state.survey.open = false;
    render();
  }
};

function openCreateSurvey() { SurveyUI.openCreateSurvey(); }
function openEditSurvey() { SurveyUI.openEditSurvey(); }

function setTab(tab) {
  state.activeTab = tab;
  nodes.tabDemo.classList.toggle('is-active', tab === 'demo');
  nodes.tabMyStacks.classList.toggle('is-active', tab === 'my-stacks');
  nodes.demoView.classList.toggle('hidden', tab !== 'demo');
  nodes.myStacksView.classList.toggle('hidden', tab !== 'my-stacks');
}

function render() {
  renderDemo();
  Renderer.renderMyStacks(state.customRuntimes);
  const selected = getSelectedCustomRuntime();
  if (!selected) return nodes.customStackWorkspace.classList.add('hidden');
  nodes.customStackWorkspace.classList.remove('hidden');
  nodes.customCashTitle.textContent = `${selected.stackName} Waiting Room`;
  nodes.customBoardTitle.textContent = `${selected.stackName} Investment Crates`;
  Renderer.renderStackView(selected);
}

function tick() {
  updateDemoTime(state.demo);
  state.customRuntimes.forEach((stack) => StackEngine.tickStack(stack));
  saveAllCustomStacks();
  render();
}

nodes.tabDemo.addEventListener('click', () => setTab('demo'));
nodes.tabMyStacks.addEventListener('click', () => setTab('my-stacks'));
nodes.createStackBtn.addEventListener('click', openCreateSurvey);
nodes.editStackBtn.addEventListener('click', openEditSurvey);
nodes.surveyBack.addEventListener('click', () => {
  if (state.survey.step <= 1) return;
  state.survey.step -= 1;
  SurveyUI.renderSurvey();
});
nodes.surveyNext.addEventListener('click', () => SurveyUI.validateAndAdvanceSurvey());

state.customRuntimes = StackStorage.loadStacks();
if (state.customRuntimes[0]) state.selectedCustomStackId = state.customRuntimes[0].stackId;
render();
setInterval(tick, TICK_MS);
