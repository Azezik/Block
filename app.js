const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;
const STORAGE_KEY = 'block.custom.stacks.v3';
const LEGACY_STORAGE_KEY = 'block.custom.stacks.v2';
const MONTHLY_BUDGET_OPTIONS = [100, 250, 500, 750, 1000];
const DEFAULT_YEARLY_ACTION_UNITS = 12;

const FREQUENCY_OPTIONS = {
  monthly: { label: 'Monthly', periodsPerYear: 12, unitLabel: 'month' }
};

const initialDemoCrates = [
  { name: 'HDIV', capacity: 6, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'VDY', capacity: 3, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'HCAL', capacity: 3, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'VFV', capacity: 3, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'TMFC', capacity: 2, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'PHYS', capacity: 2, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'YGOG', capacity: 1, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'YNVD', capacity: 1, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'YTSL', capacity: 1, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'YAMZ', capacity: 1, blocksFilled: 0, overflow: 0, totalAmount: 0 },
  { name: 'QQU', capacity: 1, blocksFilled: 0, overflow: 0, totalAmount: 0 }
];

function generateAllocationOptions(investmentCount) {
  const optionsByCount = {
    2: [
      { label: 'Balanced', blocks: [6, 6] },
      { label: 'Core + Support', blocks: [8, 4] },
      { label: 'Concentrated', blocks: [9, 3] }
    ],
    3: [
      { label: 'Balanced', blocks: [4, 4, 4] },
      { label: 'Core + Support', blocks: [6, 3, 3] },
      { label: 'Tilted', blocks: [5, 4, 3] }
    ],
    4: [
      { label: 'Balanced', blocks: [3, 3, 3, 3] },
      { label: 'Core + Spread', blocks: [6, 2, 2, 2] },
      { label: 'Moderate Tilt', blocks: [4, 3, 3, 2] }
    ],
    5: [
      { label: 'Balanced', blocks: [3, 3, 2, 2, 2] },
      { label: 'Core + Satellites', blocks: [6, 2, 2, 1, 1] },
      { label: 'Moderate Spread', blocks: [4, 3, 2, 2, 1] }
    ]
  };

  const options = optionsByCount[investmentCount] || [];
  return options
    .filter((option) => option.blocks.reduce((sum, blockCount) => sum + blockCount, 0) === DEFAULT_YEARLY_ACTION_UNITS)
    .map((option, idx) => ({
      id: `${investmentCount}-${idx}`,
      label: option.label,
      blocks: option.blocks,
      percents: option.blocks.map((blockCount) => Math.round((blockCount / DEFAULT_YEARLY_ACTION_UNITS) * 100))
    }));
}

const state = {
  activeTab: 'demo',
  demo: makeDemoRuntime(),
  customRuntimes: [],
  selectedCustomStackId: null,
  survey: {
    open: false,
    mode: 'create',
    step: 1,
    editingId: null,
    values: getEmptySurveyValues()
  }
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

const StackRules = {
  computeDerivedFields(stack) {
    const monthlyContribution = Number(stack.monthlyContribution);
    const yearlyActionUnits = Number(stack.yearlyActionUnits || DEFAULT_YEARLY_ACTION_UNITS);
    const annualTotal = monthlyContribution * yearlyActionUnits;
    return {
      periodsPerYear: yearlyActionUnits,
      contributionPerPeriod: monthlyContribution,
      blockValue: monthlyContribution,
      annualTotal,
      yearlyActionUnits
    };
  },

  validateDraft(draft) {
    if (!draft.stackName || !draft.stackName.trim()) return 'Stack name is required.';
    if (!MONTHLY_BUDGET_OPTIONS.includes(Number(draft.monthlyContribution))) return 'Choose a monthly contribution option.';
    if (!Array.isArray(draft.investments) || draft.investments.length < 2) return 'Add at least 2 investments.';
    if (draft.investments.length > 5) return 'Most responsible portfolios start with 2–5 investments.';
    const namedInvestments = draft.investments.filter((entry) => entry.name && entry.name.trim());
    if (namedInvestments.length < 2) return 'Add at least 2 investment names.';
    const allocationOptions = generateAllocationOptions(namedInvestments.length);
    if (!allocationOptions.some((option) => option.id === draft.selectedAllocationId)) return 'Choose an allocation style.';
    return null;
  },

  normalizeStackDraft(draft) {
    const validationError = StackRules.validateDraft(draft);
    if (validationError) throw new Error(validationError);

    const namedInvestments = draft.investments
      .map((entry) => ({ name: entry.name.trim(), crateId: entry.crateId || crypto.randomUUID() }))
      .filter((entry) => entry.name);

    const allocation = generateAllocationOptions(namedInvestments.length)
      .find((option) => option.id === draft.selectedAllocationId);

    const normalized = {
      stackId: draft.stackId || crypto.randomUUID(),
      stackName: draft.stackName.trim(),
      monthlyContribution: Number(draft.monthlyContribution),
      yearlyActionUnits: Number(draft.yearlyActionUnits || DEFAULT_YEARLY_ACTION_UNITS),
      annualTotal: 0,
      cashAccumulated: Number(draft.cashAccumulated || 0),
      generatedBlocksAvailable: Number(draft.generatedBlocksAvailable || 0),
      monthCounter: Number(draft.monthCounter || 1),
      elapsedMsInYear: Number(draft.elapsedMsInYear || 0),
      elapsedMsInPeriod: Number(draft.elapsedMsInPeriod || 0),
      crates: []
    };

    Object.assign(normalized, StackRules.computeDerivedFields(normalized));

    normalized.crates = namedInvestments.map((investment, index) => {
      const yearlyBlockTarget = allocation.blocks[index];
      return {
        crateId: investment.crateId,
        name: investment.name,
        yearlyBlockTarget,
        blocksFilled: 0,
        yearlyDollarTarget: yearlyBlockTarget * normalized.monthlyContribution
      };
    });

    StackRules.assertStackModel(normalized);
    return normalized;
  },

  assertStackModel(stack) {
    if (!stack || typeof stack !== 'object') throw new Error('Invalid stack model.');
    if (!stack.stackId || typeof stack.stackId !== 'string') throw new Error('Stack requires stackId.');
    if (!stack.stackName || typeof stack.stackName !== 'string') throw new Error('Stack requires stackName.');
    if (!Array.isArray(stack.crates)) throw new Error('Stack requires crates array.');
    const totalBlocks = stack.crates.reduce((sum, crate) => sum + Number(crate.yearlyBlockTarget || 0), 0);
    if (totalBlocks !== Number(stack.yearlyActionUnits)) throw new Error('Crate yearly block targets must equal yearly action units.');
    stack.crates.forEach((crate) => {
      if (!Number.isInteger(crate.yearlyBlockTarget)) throw new Error('Crate target blocks must be integer.');
      if (crate.blocksFilled > crate.yearlyBlockTarget) throw new Error('Crate blocksFilled cannot exceed yearly target.');
    });
  },

  normalizeLoadedStack(rawStack) {
    if (rawStack.monthlyContribution && rawStack.yearlyActionUnits && Array.isArray(rawStack.crates)) {
      const stack = {
        stackId: rawStack.stackId || rawStack.id || crypto.randomUUID(),
        stackName: rawStack.stackName,
        monthlyContribution: Number(rawStack.monthlyContribution),
        yearlyActionUnits: Number(rawStack.yearlyActionUnits || DEFAULT_YEARLY_ACTION_UNITS),
        annualTotal: Number(rawStack.annualTotal || 0),
        cashAccumulated: Number(rawStack.cashAccumulated || 0),
        generatedBlocksAvailable: Number(rawStack.generatedBlocksAvailable || 0),
        monthCounter: Number(rawStack.monthCounter || 1),
        elapsedMsInYear: Number(rawStack.elapsedMsInYear || 0),
        elapsedMsInPeriod: Number(rawStack.elapsedMsInPeriod || 0),
        crates: rawStack.crates.map((crate) => ({
          crateId: crate.crateId || crypto.randomUUID(),
          name: crate.name,
          yearlyBlockTarget: Number(crate.yearlyBlockTarget),
          blocksFilled: Number(crate.blocksFilled || 0),
          yearlyDollarTarget: Number(crate.yearlyDollarTarget || Number(crate.yearlyBlockTarget) * Number(rawStack.monthlyContribution))
        }))
      };
      Object.assign(stack, StackRules.computeDerivedFields(stack));
      stack.crates = stack.crates.map((crate) => ({
        ...crate,
        blocksFilled: Math.min(Math.max(0, crate.blocksFilled), crate.yearlyBlockTarget),
        yearlyDollarTarget: crate.yearlyBlockTarget * stack.monthlyContribution
      }));
      StackRules.assertStackModel(stack);
      return stack;
    }

    const monthlyContribution = Number(rawStack.monthlyBudget || rawStack.blockValue || rawStack.monthlyContribution || 100);
    const fallbackBudget = MONTHLY_BUDGET_OPTIONS.includes(monthlyContribution) ? monthlyContribution : 100;
    const normalizedCrates = (rawStack.crates || []).map((crate) => ({
      name: String(crate.name || '').trim(),
      blocksFilled: Number(crate.blocksFilled || 0)
    })).filter((crate) => crate.name);

    const investmentCount = Math.min(5, Math.max(2, normalizedCrates.length || 2));
    const allocation = generateAllocationOptions(investmentCount)[0];
    const usedCrates = normalizedCrates.slice(0, investmentCount);
    while (usedCrates.length < investmentCount) {
      usedCrates.push({ name: `Investment ${usedCrates.length + 1}`, blocksFilled: 0 });
    }

    const draft = {
      stackId: rawStack.stackId || rawStack.id || crypto.randomUUID(),
      stackName: rawStack.stackName || 'Imported Stack',
      monthlyContribution: fallbackBudget,
      yearlyActionUnits: DEFAULT_YEARLY_ACTION_UNITS,
      selectedAllocationId: allocation.id,
      cashAccumulated: Number(rawStack.cashAccumulated || 0),
      generatedBlocksAvailable: Number(rawStack.generatedBlocksAvailable || 0),
      monthCounter: Number(rawStack.monthCounter || 1),
      elapsedMsInYear: Number(rawStack.elapsedMsInYear || 0),
      elapsedMsInPeriod: Number(rawStack.elapsedMsInPeriod || 0),
      investments: usedCrates.map((crate) => ({ name: crate.name }))
    };

    const stack = StackRules.normalizeStackDraft(draft);
    stack.crates = stack.crates.map((crate, idx) => ({
      ...crate,
      blocksFilled: Math.min(crate.yearlyBlockTarget, Math.max(0, Number(usedCrates[idx].blocksFilled || 0)))
    }));
    return stack;
  }
};

const StackStorage = {
  saveStack(stack) {
    StackRules.assertStackModel(stack);
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
  },

  deleteStack(id) {
    const filtered = StackStorage.loadStacks().filter((stack) => stack.stackId !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
};

const StackEngine = {
  tickStack(stack) {
    const yearDurationMs = MONTH_DURATION_MS * Number(stack.yearlyActionUnits || DEFAULT_YEARLY_ACTION_UNITS);
    const periodDurationMs = yearDurationMs / stack.periodsPerYear;

    stack.elapsedMsInYear += TICK_MS;
    stack.elapsedMsInPeriod += TICK_MS;

    while (stack.elapsedMsInYear >= MONTH_DURATION_MS) {
      stack.monthCounter += 1;
      stack.elapsedMsInYear -= MONTH_DURATION_MS;
    }

    while (stack.elapsedMsInPeriod >= periodDurationMs) {
      stack.cashAccumulated += stack.contributionPerPeriod;
      stack.elapsedMsInPeriod -= periodDurationMs;
    }

    while (stack.cashAccumulated >= stack.blockValue) {
      stack.generatedBlocksAvailable += 1;
      stack.cashAccumulated -= stack.blockValue;
    }
  },

  allocateBlockToCrate(stack, crateId) {
    if (stack.generatedBlocksAvailable <= 0) return;
    const crate = stack.crates.find((entry) => entry.crateId === crateId);
    if (!crate || crate.blocksFilled >= crate.yearlyBlockTarget) return;

    crate.blocksFilled += 1;
    stack.generatedBlocksAvailable -= 1;
    StackStorage.saveStack(stack);
  }
};

function makeDemoRuntime() {
  return {
    id: 'demo',
    stackName: 'Demo Stack',
    monthlyContribution: 500,
    hardCapacity: true,
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
    investments: [{ name: '' }, { name: '' }],
    selectedAllocationId: null
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
  if (!stack || stack.blockValue <= 0) return 0;

  const yearDurationMs = MONTH_DURATION_MS * Number(stack.yearlyActionUnits || DEFAULT_YEARLY_ACTION_UNITS);
  const periodDurationMs = yearDurationMs / stack.periodsPerYear;
  const elapsedRatio = periodDurationMs > 0
    ? Math.min(1, Math.max(0, stack.elapsedMsInPeriod / periodDurationMs))
    : 0;
  const inFlightContribution = stack.contributionPerPeriod * elapsedRatio;
  const projectedCash = stack.cashAccumulated + inFlightContribution;

  return Math.min(100, Math.max(0, (projectedCash / stack.blockValue) * 100));
}

const Renderer = {
  renderUnallocatedBlocks(stack) {
    nodes.customAvailableBlocks.innerHTML = '';
    for (let i = 0; i < stack.generatedBlocksAvailable; i += 1) {
      const block = document.createElement('div');
      block.className = 'block';
      block.id = `${stack.stackId}-available-${i}`;
      block.draggable = true;
      block.textContent = `$${stack.blockValue.toLocaleString()}`;
      block.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', 'custom-cash-block');
        event.dataTransfer.effectAllowed = 'move';
      });
      nodes.customAvailableBlocks.appendChild(block);
    }
  },

  renderCrates(crates, stack) {
    nodes.customCrateGrid.innerHTML = '';
    crates.forEach((crate) => {
      const node = nodes.crateTemplate.content.firstElementChild.cloneNode(true);
      const percentDisplay = Math.round((crate.yearlyBlockTarget / stack.yearlyActionUnits) * 100);
      node.querySelector('.crate-label').textContent = crate.name;
      node.querySelector('.crate-count').textContent = `${crate.blocksFilled}/${crate.yearlyBlockTarget} (${percentDisplay}%)`;
      const slots = node.querySelector('.slots');
      const gridSize = Math.ceil(Math.sqrt(crate.yearlyBlockTarget));
      slots.style.setProperty('--grid-size', gridSize);

      for (let i = 0; i < gridSize * gridSize; i += 1) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        if (i >= crate.yearlyBlockTarget) slot.classList.add('ghost');
        else if (i < crate.blocksFilled) slot.classList.add('filled');
        slots.appendChild(slot);
      }

      node.addEventListener('dragover', (event) => {
        if (stack.generatedBlocksAvailable <= 0 || crate.blocksFilled >= crate.yearlyBlockTarget) return;
        event.preventDefault();
        node.classList.add('over');
      });
      node.addEventListener('dragleave', () => node.classList.remove('over'));
      node.addEventListener('drop', (event) => {
        event.preventDefault();
        node.classList.remove('over');
        if (event.dataTransfer.getData('text/plain') !== 'custom-cash-block') return;
        StackEngine.allocateBlockToCrate(stack, crate.crateId);
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
      card.innerHTML = `
        <strong>${stack.stackName}</strong>
        <span>Monthly Contribution: $${Math.round(stack.monthlyContribution).toLocaleString()}</span>
        <span>Annual Total: $${Math.round(stack.annualTotal).toLocaleString()}</span>
        <span>Yearly Action Units: ${stack.yearlyActionUnits}</span>
        <span>Crates: ${stack.crates.length}</span>
      `;
      card.addEventListener('click', () => {
        state.selectedCustomStackId = stack.stackId;
        render();
      });
      nodes.stacksList.appendChild(card);
    });
  }
};

function renderDemo() {
  const runtime = state.demo;
  nodes.monthIndicator.textContent = `Month ${runtime.time.month}`;
  nodes.cashFill.style.width = `${runtime.time.progress}%`;
  nodes.cashPercent.textContent = `${Math.round(runtime.time.progress)}%`;
  nodes.cashStatus.textContent = runtime.blocks.available.size > 0
    ? `${runtime.blocks.available.size} Cash Block${runtime.blocks.available.size > 1 ? 's' : ''} Ready`
    : 'Filling...';

  nodes.availableBlocks.innerHTML = '';
  runtime.blocks.available.forEach((blockId) => {
    const block = document.createElement('div');
    block.className = 'block';
    block.id = blockId;
    block.draggable = true;
    block.textContent = `$${runtime.monthlyContribution.toLocaleString()}`;
    block.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', block.id);
      event.dataTransfer.effectAllowed = 'move';
    });
    nodes.availableBlocks.appendChild(block);
  });

  nodes.crateGrid.innerHTML = '';
  runtime.crates.forEach((crate) => {
    const node = nodes.crateTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.crate-label').textContent = crate.name;
    node.querySelector('.crate-count').textContent = `${crate.blocksFilled}/${crate.capacity}`;
    const slots = node.querySelector('.slots');
    const gridSize = Math.ceil(Math.sqrt(crate.capacity));
    slots.style.setProperty('--grid-size', gridSize);

    for (let i = 0; i < gridSize * gridSize; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      if (i >= crate.capacity) slot.classList.add('ghost');
      else if (i < crate.blocksFilled) slot.classList.add('filled');
      slots.appendChild(slot);
    }

    node.addEventListener('dragover', (event) => {
      if (crate.blocksFilled >= crate.capacity) return;
      event.preventDefault();
      node.classList.add('over');
    });
    node.addEventListener('dragleave', () => node.classList.remove('over'));
    node.addEventListener('drop', (event) => {
      event.preventDefault();
      node.classList.remove('over');
      const blockId = event.dataTransfer.getData('text/plain');
      if (!runtime.blocks.available.has(blockId) || crate.blocksFilled >= crate.capacity) return;
      crate.blocksFilled += 1;
      crate.totalAmount += runtime.monthlyContribution;
      runtime.blocks.available.delete(blockId);
      runtime.blocks.allocated.set(blockId, crate.name);
      render();
    });

    nodes.crateGrid.appendChild(node);
  });
}

function setTab(tab) {
  state.activeTab = tab;
  nodes.tabDemo.classList.toggle('is-active', tab === 'demo');
  nodes.tabMyStacks.classList.toggle('is-active', tab === 'my-stacks');
  nodes.demoView.classList.toggle('hidden', tab !== 'demo');
  nodes.myStacksView.classList.toggle('hidden', tab !== 'my-stacks');
}

const SurveyUI = {
  openCreateSurvey() {
    state.survey = {
      open: true,
      mode: 'create',
      step: 1,
      editingId: null,
      values: getEmptySurveyValues()
    };
    SurveyUI.renderSurvey();
  },

  openEditSurvey() {
    const stack = getSelectedCustomRuntime();
    if (!stack) return;

    const investments = stack.crates.map((crate) => ({ name: crate.name, crateId: crate.crateId }));
    const allocationOptions = generateAllocationOptions(investments.length);
    const selected = allocationOptions.find((option) => option.blocks.every((count, idx) => count === stack.crates[idx].yearlyBlockTarget));

    state.survey = {
      open: true,
      mode: 'edit',
      step: 1,
      editingId: stack.stackId,
      values: {
        stackName: stack.stackName,
        monthlyContribution: stack.monthlyContribution,
        investments,
        selectedAllocationId: selected ? selected.id : null
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
      nodes.surveyContent.innerHTML = `<input id="stackNameInput" class="field" type="text" placeholder="Long-Term Growth" value="${values.stackName}"/>`;
      return;
    }

    if (state.survey.step === 2) {
      const presets = MONTHLY_BUDGET_OPTIONS
        .map((amount) => `<button class="preset ${values.monthlyContribution === amount ? 'selected' : ''}" data-amount="${amount}" type="button">$${amount.toLocaleString()}</button>`)
        .join('');
      const perYear = values.monthlyContribution ? values.monthlyContribution * DEFAULT_YEARLY_ACTION_UNITS : 0;
      nodes.surveyQuestion.textContent = 'How much can you afford to invest every month?';
      nodes.surveyContent.innerHTML = `
        <div class="preset-wrap">${presets}</div>
        <p class="survey-note">This results in $${perYear.toLocaleString()} invested per year.</p>
      `;
      nodes.surveyContent.querySelectorAll('.preset').forEach((btn) => btn.addEventListener('click', () => {
        values.monthlyContribution = Number(btn.dataset.amount);
        SurveyUI.renderSurvey();
      }));
      return;
    }

    if (state.survey.step === 3) {
      nodes.surveyQuestion.textContent = 'Add your investments (2–5 total).';
      nodes.surveyContent.innerHTML = `
        <div id="investmentRows">
          ${values.investments.map((row, idx) => `
            <div class="investment-row">
              <input class="field inv-name" data-index="${idx}" type="text" placeholder="Investment Name" value="${row.name}">
            </div>
          `).join('')}
        </div>
        <button id="addInvestment" class="btn btn-soft" type="button">Add Investment</button>
      `;

      nodes.surveyContent.querySelectorAll('.inv-name').forEach((input) => input.addEventListener('input', (event) => {
        values.investments[Number(event.target.dataset.index)].name = event.target.value;
      }));
      document.getElementById('addInvestment').addEventListener('click', () => {
        if (values.investments.length >= 5) {
          nodes.surveyError.textContent = 'Most responsible portfolios start with 2–5 investments.';
          return;
        }
        values.investments.push({ name: '' });
        SurveyUI.renderSurvey();
      });
      return;
    }

    if (state.survey.step === 4) {
      const validRows = values.investments.map((row) => ({ ...row, name: row.name.trim() })).filter((row) => row.name);
      const options = generateAllocationOptions(validRows.length);

      nodes.surveyQuestion.textContent = 'Choose your yearly block allocation style.';
      nodes.surveyContent.innerHTML = `
        <div class="allocation-grid">
          ${options.map((option) => `
            <button type="button" class="stack-card allocation-card ${values.selectedAllocationId === option.id ? 'selected' : ''}" data-option-id="${option.id}">
              <strong>${option.label}</strong>
              <span>${option.blocks.join(' / ')}</span>
              <span>(${option.percents.map((percent) => `${percent}%`).join(' / ')})</span>
            </button>
          `).join('')}
        </div>
      `;

      nodes.surveyContent.querySelectorAll('.allocation-card').forEach((card) => {
        card.addEventListener('click', () => {
          values.selectedAllocationId = card.dataset.optionId;
          SurveyUI.renderSurvey();
        });
      });
    }
  },

  validateAndAdvanceSurvey() {
    nodes.surveyError.textContent = '';
    const values = state.survey.values;

    if (state.survey.step === 1) {
      const name = document.getElementById('stackNameInput').value.trim();
      if (!name) return void (nodes.surveyError.textContent = 'Stack name is required.');
      const duplicate = state.customRuntimes.some((stack) => stack.stackName.toLowerCase() === name.toLowerCase() && stack.stackId !== state.survey.editingId);
      if (duplicate) return void (nodes.surveyError.textContent = 'Stack name must be unique.');
      values.stackName = name;
      state.survey.step += 1;
      return SurveyUI.renderSurvey();
    }

    if (state.survey.step === 2) {
      if (!MONTHLY_BUDGET_OPTIONS.includes(values.monthlyContribution)) {
        return void (nodes.surveyError.textContent = 'Choose a monthly contribution option.');
      }
      state.survey.step += 1;
      return SurveyUI.renderSurvey();
    }

    if (state.survey.step === 3) {
      const validRows = values.investments.map((row) => ({ ...row, name: row.name.trim() })).filter((row) => row.name);

      if (validRows.length < 2) return void (nodes.surveyError.textContent = 'Add at least 2 investment names.');
      if (validRows.length > 5) return void (nodes.surveyError.textContent = 'Most responsible portfolios start with 2–5 investments.');

      values.investments = validRows;
      values.selectedAllocationId = null;
      state.survey.step += 1;
      return SurveyUI.renderSurvey();
    }

    const draft = {
      stackId: state.survey.mode === 'edit' ? state.survey.editingId : undefined,
      stackName: values.stackName,
      monthlyContribution: values.monthlyContribution,
      yearlyActionUnits: DEFAULT_YEARLY_ACTION_UNITS,
      selectedAllocationId: values.selectedAllocationId,
      investments: values.investments
    };

    const draftError = StackRules.validateDraft(draft);
    if (draftError) return void (nodes.surveyError.textContent = draftError);

    const built = StackRules.normalizeStackDraft(draft);

    if (state.survey.mode === 'edit') {
      const existing = getSelectedCustomRuntime();
      const existingCash = existing ? existing.cashAccumulated : 0;
      const existingMonth = existing ? existing.monthCounter : 1;
      const existingYearMs = existing ? existing.elapsedMsInYear : 0;
      const existingProgress = existing ? existing.elapsedMsInPeriod : 0;

      built.cashAccumulated = existingCash;
      built.monthCounter = existingMonth;
      built.elapsedMsInYear = existingYearMs;
      built.elapsedMsInPeriod = existingProgress;
      built.generatedBlocksAvailable = 0;

      const idx = state.customRuntimes.findIndex((stack) => stack.stackId === state.survey.editingId);
      if (idx >= 0) state.customRuntimes[idx] = built;
      state.selectedCustomStackId = built.stackId;
    } else {
      state.customRuntimes.push(built);
      state.selectedCustomStackId = built.stackId;
    }

    saveAllCustomStacks();
    state.survey.open = false;
    setTab('my-stacks');
    render();
  }
};

function openCreateSurvey() {
  SurveyUI.openCreateSurvey();
}

function openEditSurvey() {
  SurveyUI.openEditSurvey();
}

function render() {
  renderDemo();
  Renderer.renderMyStacks(state.customRuntimes);
  const selected = getSelectedCustomRuntime();

  if (!selected) {
    nodes.customStackWorkspace.classList.add('hidden');
  } else {
    nodes.customStackWorkspace.classList.remove('hidden');
    nodes.customCashTitle.textContent = `${selected.stackName} Cash Crate`;
    nodes.customBoardTitle.textContent = `${selected.stackName} Investment Crates`;
    Renderer.renderStackView(selected);
  }
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

nodes.createStackBtn.textContent = '+ Create New Stack';

state.customRuntimes = StackStorage.loadStacks();
if (state.customRuntimes[0]) state.selectedCustomStackId = state.customRuntimes[0].stackId;
render();
setInterval(tick, TICK_MS);
