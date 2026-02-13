const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;
const STORAGE_KEY = 'block.custom.stacks.v4';
const LEGACY_STORAGE_KEY = 'block.custom.stacks.v3';
const MONTHLY_BUDGET_OPTIONS = [100, 250, 500, 750, 1000];
const DEFAULT_YEARLY_ACTION_UNITS = 12;

const initialDemoCrates = [
  { name: 'HDIV', capacity: 6, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'VDY', capacity: 3, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'HCAL', capacity: 3, blocksFilled: 0, overflow: 0, totalAmount: 0 }
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

function updateCrateProgress(crate, blockValue) {
  const actualDollar = Number(crate.actualDollar || 0);
  crate.fullBlocks = Math.floor(actualDollar / blockValue);
  crate.partialBlockProgress = (actualDollar % blockValue) / blockValue;
  crate.overflowDollar = Math.max(0, actualDollar - Number(crate.targetDollar || 0));
}

function calculateTargets(stack) {
  stack.blockValue = Number(stack.monthlyContribution);
  stack.yearlyActionUnits = DEFAULT_YEARLY_ACTION_UNITS;
  stack.annualGoal = stack.blockValue * stack.yearlyActionUnits;
  stack.annualTotal = stack.annualGoal;
  stack.periodsPerYear = stack.yearlyActionUnits;
  stack.contributionPerPeriod = stack.monthlyContribution;

  stack.crates.forEach((crate) => {
    crate.targetDollar = stack.annualGoal * (crate.targetPercent / 100);
    crate.targetBlocks = crate.targetDollar / stack.blockValue;
    updateCrateProgress(crate, stack.blockValue);
  });
  return stack;
}

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
      if (idx === changedIndex) {
        item.targetPercent = bounded;
      } else {
        item.targetPercent = (item.targetPercent / totalOther) * targetOther;
      }
    });
  }

  const rawTotal = investments.reduce((sum, item) => sum + item.targetPercent, 0);
  const diff = 100 - rawTotal;
  investments[investments.length - 1].targetPercent += diff;
}

const StackRules = {
  validateDraft(draft) {
    if (!draft.stackName || !draft.stackName.trim()) return 'Stack name is required.';
    if (!MONTHLY_BUDGET_OPTIONS.includes(Number(draft.monthlyContribution))) return 'Choose a monthly contribution option.';
    const named = draft.investments.map((item) => ({ ...item, name: item.name.trim() })).filter((item) => item.name);
    if (named.length < 2) return 'Add at least 2 investment names.';
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
      yearlyActionUnits: DEFAULT_YEARLY_ACTION_UNITS,
      cashAccumulated: Number(draft.cashAccumulated || 0),
      generatedBlocksAvailable: Number(draft.generatedBlocksAvailable || 0),
      monthCounter: Number(draft.monthCounter || 1),
      elapsedMsInYear: Number(draft.elapsedMsInYear || 0),
      elapsedMsInPeriod: Number(draft.elapsedMsInPeriod || 0),
      crates: draft.investments
        .map((item) => ({
          crateId: item.crateId || crypto.randomUUID(),
          name: item.name.trim(),
          targetPercent: Number(item.targetPercent || 0),
          actualDollar: Number(item.actualDollar || 0)
        }))
        .filter((item) => item.name)
    };

    calculateTargets(stack);
    StackRules.assertStackModel(stack);
    return stack;
  },

  assertStackModel(stack) {
    if (!stack.stackId || !Array.isArray(stack.crates)) throw new Error('Invalid stack.');
    const totalPercent = stack.crates.reduce((sum, crate) => sum + Number(crate.targetPercent || 0), 0);
    if (Math.abs(totalPercent - 100) > 0.1) throw new Error('Crate percentages must total 100%.');
  },

  normalizeLoadedStack(rawStack) {
    if (Array.isArray(rawStack.crates) && rawStack.crates.every((crate) => typeof crate.targetPercent === 'number')) {
      const stack = {
        stackId: rawStack.stackId || crypto.randomUUID(),
        stackName: rawStack.stackName || 'Imported Stack',
        monthlyContribution: Number(rawStack.monthlyContribution || 100),
        cashAccumulated: Number(rawStack.cashAccumulated || 0),
        generatedBlocksAvailable: Number(rawStack.generatedBlocksAvailable || 0),
        monthCounter: Number(rawStack.monthCounter || 1),
        elapsedMsInYear: Number(rawStack.elapsedMsInYear || 0),
        elapsedMsInPeriod: Number(rawStack.elapsedMsInPeriod || 0),
        crates: rawStack.crates.map((crate) => ({
          crateId: crate.crateId || crypto.randomUUID(),
          name: crate.name,
          targetPercent: Number(crate.targetPercent || 0),
          actualDollar: Number(crate.actualDollar || 0)
        }))
      };
      return calculateTargets(stack);
    }

    const monthly = MONTHLY_BUDGET_OPTIONS.includes(Number(rawStack.monthlyContribution)) ? Number(rawStack.monthlyContribution) : 100;
    const legacyCrates = (rawStack.crates || []).map((crate) => ({ name: crate.name || 'Investment', blocksFilled: Number(crate.blocksFilled || 0) }));
    const count = Math.max(2, legacyCrates.length || 2);
    const equal = 100 / count;
    const draft = {
      stackId: rawStack.stackId || rawStack.id || crypto.randomUUID(),
      stackName: rawStack.stackName || 'Imported Stack',
      monthlyContribution: monthly,
      cashAccumulated: Number(rawStack.cashAccumulated || 0),
      generatedBlocksAvailable: Number(rawStack.generatedBlocksAvailable || 0),
      monthCounter: Number(rawStack.monthCounter || 1),
      elapsedMsInYear: Number(rawStack.elapsedMsInYear || 0),
      elapsedMsInPeriod: Number(rawStack.elapsedMsInPeriod || 0),
      investments: Array.from({ length: count }, (_, idx) => {
        const legacy = legacyCrates[idx] || { name: `Investment ${idx + 1}`, blocksFilled: 0 };
        return {
          name: legacy.name,
          targetPercent: idx === count - 1 ? 100 - equal * (count - 1) : equal,
          actualDollar: legacy.blocksFilled * monthly
        };
      })
    };
    return StackRules.normalizeStackDraft(draft);
  }
};

const StackStorage = {
  saveStack(stack) {
    const stacks = StackStorage.loadStacks();
    const idx = stacks.findIndex((entry) => entry.stackId === stack.stackId);
    if (idx >= 0) stacks[idx] = stack;
    else stacks.push(stack);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stacks));
  },
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

const StackEngine = {
  tickStack(stack) {
    stack.elapsedMsInYear += TICK_MS;
    stack.elapsedMsInPeriod += TICK_MS;

    while (stack.elapsedMsInYear >= MONTH_DURATION_MS) {
      stack.monthCounter += 1;
      stack.elapsedMsInYear -= MONTH_DURATION_MS;
    }

    while (stack.elapsedMsInPeriod >= MONTH_DURATION_MS) {
      stack.cashAccumulated += stack.contributionPerPeriod;
      stack.elapsedMsInPeriod -= MONTH_DURATION_MS;
    }

    while (stack.cashAccumulated >= stack.blockValue) {
      stack.generatedBlocksAvailable += 1;
      stack.cashAccumulated -= stack.blockValue;
    }
  },

  allocateBlockToCrate(stack, crateId) {
    if (stack.generatedBlocksAvailable <= 0) return;
    const crate = stack.crates.find((entry) => entry.crateId === crateId);
    if (!crate) return;

    crate.actualDollar += stack.blockValue;
    updateCrateProgress(crate, stack.blockValue);
    stack.generatedBlocksAvailable -= 1;
    StackStorage.saveStack(stack);
  },

  moveFullBlock(stack, fromCrateId, toCrateId) {
    if (fromCrateId === toCrateId) return;
    const from = stack.crates.find((item) => item.crateId === fromCrateId);
    const to = stack.crates.find((item) => item.crateId === toCrateId);
    if (!from || !to || from.fullBlocks <= 0) return;
    from.actualDollar -= stack.blockValue;
    to.actualDollar += stack.blockValue;
    updateCrateProgress(from, stack.blockValue);
    updateCrateProgress(to, stack.blockValue);
    StackStorage.saveStack(stack);
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

function getStackCashProgressPercent(stack) {
  const elapsedRatio = Math.min(1, Math.max(0, stack.elapsedMsInPeriod / MONTH_DURATION_MS));
  const projectedCash = stack.cashAccumulated + (stack.contributionPerPeriod * elapsedRatio);
  return Math.min(100, Math.max(0, (projectedCash / stack.blockValue) * 100));
}

const Renderer = {
  renderUnallocatedBlocks(stack) {
    nodes.customAvailableBlocks.innerHTML = '';
    for (let i = 0; i < stack.generatedBlocksAvailable; i += 1) {
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

      const status = crate.actualDollar > crate.targetDollar ? 'Over' : crate.actualDollar < crate.targetDollar ? 'Under' : 'At';
      node.querySelector('.crate-count').textContent = `${status} · ${crate.targetPercent.toFixed(1)}%`;

      const slots = node.querySelector('.slots');
      slots.classList.add('stack-layers');
      const renderedBlocks = Math.max(1, Math.ceil(Math.max(crate.targetBlocks, crate.actualDollar / stack.blockValue)));

      for (let i = 0; i < renderedBlocks; i += 1) {
        const cell = document.createElement('div');
        cell.className = 'slot layer-slot';
        const targetFill = Math.min(1, Math.max(0, crate.targetBlocks - i));
        const actualFill = Math.min(1, Math.max(0, (crate.actualDollar / stack.blockValue) - i));
        const greenFill = Math.min(actualFill, targetFill || 1);
        const overflowFill = Math.max(0, actualFill - targetFill);

        const ghost = document.createElement('div');
        ghost.className = 'slot-fill ghost-fill';
        ghost.style.height = `${targetFill * 100}%`;
        const actual = document.createElement('div');
        actual.className = 'slot-fill actual-fill';
        actual.style.height = `${(overflowFill > 0 ? actualFill - overflowFill : actualFill) * 100}%`;
        const overflow = document.createElement('div');
        overflow.className = 'slot-fill overflow-fill';
        overflow.style.height = `${overflowFill * 100}%`;

        if (i < crate.fullBlocks) {
          actual.classList.add('full-block');
          actual.draggable = true;
          actual.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'full-block', fromCrateId: crate.crateId }));
          });
        }

        cell.append(ghost, actual, overflow);
        slots.appendChild(cell);
      }

      const summary = document.createElement('p');
      summary.className = 'crate-meta';
      summary.textContent = `Target $${crate.targetDollar.toFixed(0)} · Actual $${crate.actualDollar.toFixed(0)} · Overflow $${crate.overflowDollar.toFixed(0)}`;
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
        if (payload.type === 'cash') StackEngine.allocateBlockToCrate(stack, crate.crateId);
        if (payload.type === 'full-block') StackEngine.moveFullBlock(stack, payload.fromCrateId, crate.crateId);
        render();
      });

      nodes.customCrateGrid.appendChild(node);
    });
  },

  renderStackView(stack) {
    const progress = getStackCashProgressPercent(stack);
    nodes.customMonthIndicator.textContent = `Month ${stack.monthCounter}`;
    nodes.customCashFill.style.width = `${progress}%`;
    nodes.customCashPercent.textContent = `${Math.round(progress)}%`;
    nodes.customCashStatus.textContent = stack.generatedBlocksAvailable > 0
      ? `${stack.generatedBlocksAvailable} Cash Block${stack.generatedBlocksAvailable > 1 ? 's' : ''} Ready`
      : `Accumulating cash: $${stack.cashAccumulated.toFixed(2)}`;

    Renderer.renderUnallocatedBlocks(stack);
    Renderer.renderCrates(stack.crates, stack);
  },

  renderMyStacks(stacks) {
    nodes.stacksList.innerHTML = '';
    if (stacks.length === 0) {
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
      card.innerHTML = `<strong>${stack.stackName}</strong><span>Monthly: $${stack.monthlyContribution}</span><span>Annual Goal: $${stack.annualGoal}</span><span>Crates: ${stack.crates.length}</span>`;
      card.addEventListener('click', () => { state.selectedCustomStackId = stack.stackId; render(); });
      nodes.stacksList.appendChild(card);
    });
  }
};

function renderDemo() {
  const runtime = state.demo;
  nodes.monthIndicator.textContent = `Month ${runtime.time.month}`;
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
        investments: stack.crates.map((crate) => ({ name: crate.name, crateId: crate.crateId, targetPercent: crate.targetPercent, actualDollar: crate.actualDollar }))
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
      const perYear = values.monthlyContribution ? values.monthlyContribution * DEFAULT_YEARLY_ACTION_UNITS : 0;
      nodes.surveyQuestion.textContent = 'How much can you afford to invest every month?';
      nodes.surveyContent.innerHTML = `<div class="preset-wrap">${presets}</div><p class="survey-note">This results in $${perYear.toLocaleString()} invested per year.</p>`;
      nodes.surveyContent.querySelectorAll('.preset').forEach((btn) => btn.addEventListener('click', () => { values.monthlyContribution = Number(btn.dataset.amount); SurveyUI.renderSurvey(); }));
      return;
    }

    if (state.survey.step === 3) {
      nodes.surveyQuestion.textContent = 'Add your investments (minimum 2).';
      nodes.surveyContent.innerHTML = `<div>${values.investments.map((row, idx) => `<div class="investment-row"><input class="field inv-name" data-index="${idx}" type="text" value="${row.name}"></div>`).join('')}</div><button id="addInvestment" class="btn btn-soft" type="button">Add Investment</button>`;
      nodes.surveyContent.querySelectorAll('.inv-name').forEach((input) => input.addEventListener('input', (event) => {
        values.investments[Number(event.target.dataset.index)].name = event.target.value;
      }));
      document.getElementById('addInvestment').addEventListener('click', () => {
        const n = values.investments.length + 1;
        values.investments.push({ name: '', targetPercent: 100 / n });
        values.investments.forEach((item) => { item.targetPercent = 100 / n; });
        SurveyUI.renderSurvey();
      });
      return;
    }

    const trimmed = values.investments.map((item) => ({ ...item, name: item.name.trim() })).filter((item) => item.name);
    nodes.surveyQuestion.textContent = 'Set target allocation percentages (must total 100%).';
    nodes.surveyContent.innerHTML = `<div>${trimmed.map((item, idx) => `<div class="investment-row"><label>${item.name}</label><input class="field alloc" data-index="${idx}" type="number" min="0" max="100" step="0.1" value="${item.targetPercent.toFixed(1)}"></div>`).join('')}</div><p class="survey-note">Total: ${trimmed.reduce((s, item) => s + item.targetPercent, 0).toFixed(1)}%</p>`;
    nodes.surveyContent.querySelectorAll('.alloc').forEach((input) => input.addEventListener('input', (event) => {
      const idx = Number(event.target.dataset.index);
      normalizePercentDraft(trimmed, idx, Number(event.target.value));
      values.investments = trimmed;
      SurveyUI.renderSurvey();
    }));
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
      if (named.length < 2) return void (nodes.surveyError.textContent = 'Add at least 2 investment names.');
      const equal = 100 / named.length;
      values.investments = named.map((item, idx) => ({ ...item, targetPercent: idx === named.length - 1 ? 100 - equal * (named.length - 1) : equal }));
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
      built.cashAccumulated = existing ? existing.cashAccumulated : 0;
      built.generatedBlocksAvailable = existing ? existing.generatedBlocksAvailable : 0;
      built.monthCounter = existing ? existing.monthCounter : 1;
      built.elapsedMsInYear = existing ? existing.elapsedMsInYear : 0;
      built.elapsedMsInPeriod = existing ? existing.elapsedMsInPeriod : 0;

      const existingById = new Map((existing ? existing.crates : []).map((crate) => [crate.crateId, crate]));
      built.crates.forEach((crate) => {
        const old = existingById.get(crate.crateId);
        if (old) crate.actualDollar = old.actualDollar;
        updateCrateProgress(crate, built.blockValue);
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
  nodes.customCashTitle.textContent = `${selected.stackName} Cash Crate`;
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
