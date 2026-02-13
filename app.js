const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;
const STORAGE_KEY = 'block.custom.stacks.v2';
const LEGACY_STORAGE_KEY = 'block.custom.stacks.v1';
const TARGET_ACTIONS_PER_YEAR = 12;

/*
Modularity Notes
- Add a new survey question in `SurveyUI.renderSurvey()` and gate progression in `SurveyUI.validateAndAdvanceSurvey()`.
- Change rounding rules in `StackRules.round_to_nice()`.
- Change frequency options in `FREQUENCY_OPTIONS`.
- Change rendering layout in `Renderer.renderMyStacks()`, `Renderer.renderStackView()`, and `Renderer.renderCrates()`.

Current Flow Map
- Survey -> stack creation: `SurveyUI.validateAndAdvanceSurvey()` -> `StackRules.normalizeStackDraft()`.
- Storage: `StackStorage.saveStack()`, `StackStorage.loadStacks()`, `StackStorage.loadStackById()`, `StackStorage.deleteStack()`.
- Engine ticks: `tick()` -> `StackEngine.tickStack()`.
- Rendering: `render()` -> `Renderer.renderMyStacks()` + `Renderer.renderStackView()`.
- Allocation: crate drop handler -> `StackEngine.allocateBlockToCrate()`.
*/

const FREQUENCY_OPTIONS = {
  weekly: { label: 'Weekly', periodsPerYear: 52, unitLabel: 'week' },
  biweekly: { label: 'Biweekly', periodsPerYear: 26, unitLabel: 'biweekly period' },
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
  round_to_nice(value) {
    return Math.max(5, Math.round(value / 5) * 5);
  },

  computeDerivedFields(stack) {
    const periodsPerYear = FREQUENCY_OPTIONS[stack.contributionFrequency].periodsPerYear;
    const contributionPerPeriod = stack.annualGoal / periodsPerYear;
    const blockValue = StackRules.round_to_nice(stack.annualGoal / TARGET_ACTIONS_PER_YEAR);
    return { periodsPerYear, contributionPerPeriod, blockValue };
  },

  computeCrateDerived(crate, blockValue) {
    const currentAmount = Math.max(0, Number(crate.currentAmount) || 0);
    const blocksFilled = blockValue > 0 ? Math.floor(currentAmount / blockValue) : 0;
    const overflow = blockValue > 0 ? currentAmount % blockValue : 0;
    return { blocksFilled, overflow, currentAmount };
  },

  validateDraft(draft) {
    if (!draft.stackName || !draft.stackName.trim()) return 'Stack name is required.';
    if (!FREQUENCY_OPTIONS[draft.contributionFrequency]) return 'Contribution frequency is invalid.';
    if (!Number.isFinite(Number(draft.annualGoal)) || Number(draft.annualGoal) <= 0) return 'Annual goal must be greater than 0.';
    if (!Array.isArray(draft.investments) || draft.investments.length === 0) return 'Add at least one investment name.';
    const named = draft.investments.some((entry) => entry.name && entry.name.trim());
    if (!named) return 'Add at least one investment name.';
    return null;
  },

  normalizeStackDraft(draft) {
    const validationError = StackRules.validateDraft(draft);
    if (validationError) throw new Error(validationError);

    const normalized = {
      stackId: draft.stackId || crypto.randomUUID(),
      stackName: draft.stackName.trim(),
      annualGoal: Number(draft.annualGoal),
      contributionFrequency: draft.contributionFrequency,
      targetActionsPerYear: TARGET_ACTIONS_PER_YEAR,
      cashAccumulated: Number(draft.cashAccumulated || 0),
      generatedBlocksAvailable: Number(draft.generatedBlocksAvailable || 0),
      monthCounter: Number(draft.monthCounter || 1),
      elapsedMsInYear: Number(draft.elapsedMsInYear || 0),
      elapsedMsInPeriod: Number(draft.elapsedMsInPeriod || 0),
      crates: []
    };

    Object.assign(normalized, StackRules.computeDerivedFields(normalized));

    normalized.crates = draft.investments
      .map((entry) => ({ name: entry.name.trim(), currentAmount: entry.amount === '' ? 0 : entry.amount, crateId: entry.crateId || crypto.randomUUID() }))
      .filter((entry) => entry.name)
      .map((entry) => {
        const derived = StackRules.computeCrateDerived(entry, normalized.blockValue);
        return {
          crateId: entry.crateId,
          name: entry.name,
          currentAmount: derived.currentAmount,
          blocksFilled: derived.blocksFilled,
          overflow: derived.overflow,
          capacity: Math.max(derived.blocksFilled, 1)
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
    if (!Number.isFinite(stack.blockValue) || stack.blockValue <= 0) throw new Error('Stack requires valid blockValue.');
  },

  normalizeLoadedStack(rawStack) {
    if (rawStack.annualGoal && rawStack.blockValue) {
      const model = {
        stackId: rawStack.stackId || rawStack.id || crypto.randomUUID(),
        stackName: rawStack.stackName,
        annualGoal: Number(rawStack.annualGoal),
        contributionFrequency: rawStack.contributionFrequency,
        targetActionsPerYear: Number(rawStack.targetActionsPerYear || TARGET_ACTIONS_PER_YEAR),
        cashAccumulated: Number(rawStack.cashAccumulated || 0),
        generatedBlocksAvailable: Number(rawStack.generatedBlocksAvailable || 0),
        monthCounter: Number(rawStack.monthCounter || 1),
        elapsedMsInYear: Number(rawStack.elapsedMsInYear || 0),
        elapsedMsInPeriod: Number(rawStack.elapsedMsInPeriod || 0),
        investments: (rawStack.crates || []).map((crate) => ({
          crateId: crate.crateId || crate.id || crypto.randomUUID(),
          name: crate.name,
          amount: Number(crate.currentAmount || 0)
        }))
      };
      return StackRules.normalizeStackDraft(model);
    }

    const monthlyContribution = Number(rawStack.monthlyContribution || 0);
    const legacyAnnual = monthlyContribution * 12;
    const legacyDraft = {
      stackName: rawStack.stackName,
      annualGoal: legacyAnnual,
      contributionFrequency: 'monthly',
      investments: (rawStack.crates || []).map((crate) => ({
        name: crate.name,
        amount: Number(crate.totalAmount || 0)
      }))
    };
    return StackRules.normalizeStackDraft(legacyDraft);
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

  loadStackById(id) {
    return StackStorage.loadStacks().find((stack) => stack.stackId === id) || null;
  },

  deleteStack(id) {
    const filtered = StackStorage.loadStacks().filter((stack) => stack.stackId !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
};

const StackEngine = {
  tickStack(stack) {
    const yearDurationMs = MONTH_DURATION_MS * 12;
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
    if (!crate) return;

    crate.currentAmount += stack.blockValue;
    const derived = StackRules.computeCrateDerived(crate, stack.blockValue);
    crate.blocksFilled = derived.blocksFilled;
    crate.overflow = derived.overflow;
    crate.capacity = Math.max(crate.capacity, crate.blocksFilled);
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
    annualGoalPreset: null,
    annualGoalInput: '',
    annualGoal: null,
    contributionFrequency: 'weekly',
    periodsPerYear: 52,
    contributionPerPeriod: null,
    targetActionsPerYear: TARGET_ACTIONS_PER_YEAR,
    blockValue: null,
    investments: [{ name: '', amount: '' }]
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
        if (stack.generatedBlocksAvailable <= 0) return;
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
    const progress = Math.min(100, (stack.cashAccumulated / stack.blockValue) * 100);
    nodes.customMonthIndicator.textContent = `Month ${stack.monthCounter}`;
    nodes.customCashFill.style.width = `${progress}%`;
    nodes.customCashPercent.textContent = `${Math.round(progress)}%`;
    nodes.customCashStatus.textContent = stack.generatedBlocksAvailable > 0
      ? `${stack.generatedBlocksAvailable} Cash Block${stack.generatedBlocksAvailable > 1 ? 's' : ''} Ready`
      : `Accumulating cash: $${stack.cashAccumulated.toFixed(2)}`;

    Renderer.renderUnallocatedBlocks(stack.unallocatedBlocks !== undefined
      ? { ...stack, generatedBlocksAvailable: stack.unallocatedBlocks }
      : stack);
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
      const frequencyLabel = FREQUENCY_OPTIONS[stack.contributionFrequency]?.label || stack.contributionFrequency;
      card.innerHTML = `
        <strong>${stack.stackName}</strong>
        <span>Annual Goal: $${Math.round(stack.annualGoal).toLocaleString()}</span>
        <span>Frequency: ${frequencyLabel}</span>
        <span>Contribution / Period: $${stack.contributionPerPeriod.toFixed(2)}</span>
        <span>Block Value: $${stack.blockValue.toLocaleString()}</span>
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

    state.survey = {
      open: true,
      mode: 'edit',
      step: 1,
      editingId: stack.stackId,
      values: {
        stackName: stack.stackName,
        annualGoalPreset: null,
        annualGoalInput: String(stack.annualGoal),
        annualGoal: stack.annualGoal,
        contributionFrequency: stack.contributionFrequency,
        periodsPerYear: stack.periodsPerYear,
        contributionPerPeriod: stack.contributionPerPeriod,
        targetActionsPerYear: stack.targetActionsPerYear,
        blockValue: stack.blockValue,
        investments: stack.crates.map((crate) => ({ name: crate.name, amount: String(crate.currentAmount), crateId: crate.crateId }))
      }
    };
    SurveyUI.renderSurvey();
  },

  renderSurvey() {
    const values = state.survey.values;
    nodes.surveyModal.classList.toggle('hidden', !state.survey.open);
    nodes.surveyError.textContent = '';
    nodes.surveyBack.style.visibility = state.survey.step === 1 ? 'hidden' : 'visible';
    nodes.surveyNext.textContent = state.survey.step === 5 ? 'Save Stack' : 'Save / Continue';

    if (state.survey.step === 1) {
      nodes.surveyQuestion.textContent = 'What would you like to name this stack?';
      nodes.surveyContent.innerHTML = `<input id="stackNameInput" class="field" type="text" placeholder="Long-Term Growth" value="${values.stackName}"/>`;
      return;
    }

    if (state.survey.step === 2) {
      const presets = [600, 1200, 3000, 6000, 12000, 20000]
        .map((amount) => `<button class="preset ${values.annualGoalPreset === amount ? 'selected' : ''}" data-amount="${amount}" type="button">$${amount.toLocaleString()}</button>`)
        .join('');
      nodes.surveyQuestion.textContent = 'How much do you want to invest by the end of the year?';
      nodes.surveyContent.innerHTML = `<div class="preset-wrap">${presets}</div><input id="annualGoalInput" class="field" type="number" min="1" step="1" placeholder="Custom annual goal" value="${values.annualGoalInput}"/>`;
      nodes.surveyContent.querySelectorAll('.preset').forEach((btn) => btn.addEventListener('click', () => {
        values.annualGoalPreset = Number(btn.dataset.amount);
        values.annualGoalInput = '';
        SurveyUI.renderSurvey();
      }));
      return;
    }

    if (state.survey.step === 3) {
      nodes.surveyQuestion.textContent = 'How often will you contribute?';
      nodes.surveyContent.innerHTML = Object.entries(FREQUENCY_OPTIONS)
        .map(([key, option]) => `<label class="radio-row"><input type="radio" name="frequency" value="${key}" ${values.contributionFrequency === key ? 'checked' : ''}/> ${option.label} (${option.periodsPerYear} periods/year)</label>`)
        .join('') + '<div id="freqSummary" class="survey-note"></div>';

      nodes.surveyContent.querySelectorAll('input[name="frequency"]').forEach((input) => {
        input.addEventListener('change', (event) => {
          values.contributionFrequency = event.target.value;
          SurveyUI.renderSurvey();
        });
      });

      if (values.annualGoal) {
        const derived = StackRules.computeDerivedFields({
          annualGoal: values.annualGoal,
          contributionFrequency: values.contributionFrequency
        });
        document.getElementById('freqSummary').textContent = `Contribution per period: $${derived.contributionPerPeriod.toFixed(2)}`;
      }
      return;
    }

    if (state.survey.step === 4) {
      const derived = StackRules.computeDerivedFields({
        annualGoal: values.annualGoal,
        contributionFrequency: values.contributionFrequency
      });
      const periodUnit = FREQUENCY_OPTIONS[values.contributionFrequency].unitLabel;

      values.periodsPerYear = derived.periodsPerYear;
      values.contributionPerPeriod = derived.contributionPerPeriod;
      values.blockValue = derived.blockValue;

      nodes.surveyQuestion.textContent = 'Your investing action cadence';
      nodes.surveyContent.innerHTML = `
        <p class="survey-note">You’ll contribute about $${derived.contributionPerPeriod.toFixed(2)} per ${periodUnit}.</p>
        <p class="survey-note">You’ll invest about $${(values.annualGoal / 12).toFixed(2)} each month (1 action block).</p>
        <p class="survey-note">Block value: $${derived.blockValue.toLocaleString()}</p>
        <details>
          <summary>Advanced</summary>
          <p class="survey-note">Target actions per year defaults to ${TARGET_ACTIONS_PER_YEAR} in this version.</p>
        </details>
      `;
      return;
    }

    nodes.surveyQuestion.textContent = 'What investments do you have or plan to invest in?';
    nodes.surveyContent.innerHTML = `
      <div id="investmentRows">
        ${values.investments.map((row, idx) => `
          <div class="investment-row">
            <input class="field inv-name" data-index="${idx}" type="text" placeholder="Investment Name" value="${row.name}">
            <input class="field inv-amount" data-index="${idx}" type="number" min="0" step="1" placeholder="Current Amount" value="${row.amount}">
          </div>
        `).join('')}
      </div>
      <button id="addInvestment" class="btn btn-soft" type="button">Add Investment</button>
    `;

    nodes.surveyContent.querySelectorAll('.inv-name').forEach((input) => input.addEventListener('input', (event) => {
      values.investments[Number(event.target.dataset.index)].name = event.target.value;
    }));
    nodes.surveyContent.querySelectorAll('.inv-amount').forEach((input) => input.addEventListener('input', (event) => {
      values.investments[Number(event.target.dataset.index)].amount = event.target.value;
    }));
    document.getElementById('addInvestment').addEventListener('click', () => {
      values.investments.push({ name: '', amount: '' });
      SurveyUI.renderSurvey();
    });
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
      const customInput = document.getElementById('annualGoalInput').value;
      const customAmount = customInput ? Number(customInput) : null;
      const annualGoal = customAmount && customAmount > 0 ? customAmount : values.annualGoalPreset;
      if (!annualGoal || annualGoal <= 0) return void (nodes.surveyError.textContent = 'Choose or enter an annual goal.');
      values.annualGoal = annualGoal;
      values.annualGoalInput = customInput;
      state.survey.step += 1;
      return SurveyUI.renderSurvey();
    }

    if (state.survey.step < 5) {
      state.survey.step += 1;
      return SurveyUI.renderSurvey();
    }

    const validRows = values.investments
      .map((row) => ({ name: row.name.trim(), amount: row.amount === '' ? '0' : row.amount, crateId: row.crateId }))
      .filter((row) => row.name);

    if (validRows.length === 0) return void (nodes.surveyError.textContent = 'Add at least one investment name.');

    values.investments = validRows;

    const draft = {
      stackId: state.survey.mode === 'edit' ? state.survey.editingId : undefined,
      stackName: values.stackName,
      annualGoal: values.annualGoal,
      contributionFrequency: values.contributionFrequency,
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
    Renderer.renderStackView({ ...selected, unallocatedBlocks: selected.generatedBlocksAvailable });
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
