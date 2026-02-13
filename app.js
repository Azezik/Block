const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;
const STORAGE_KEY = 'block.custom.stacks.v2';
const LEGACY_STORAGE_KEY = 'block.custom.stacks.v1';
const TARGET_ACTIONS_PER_YEAR = 12;

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

function roundToNice(value) {
  return Math.max(5, Math.round(value / 5) * 5);
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

function buildStackFromSurvey(values, existingId) {
  const annualGoal = values.annualGoal;
  const periodsPerYear = FREQUENCY_OPTIONS[values.contributionFrequency].periodsPerYear;
  const contributionPerPeriod = annualGoal / periodsPerYear;
  const blockValue = roundToNice(annualGoal / TARGET_ACTIONS_PER_YEAR);
  const crates = values.investments
    .map((entry) => ({ name: entry.name.trim(), amount: entry.amount === '' ? '0' : entry.amount }))
    .filter((entry) => entry.name)
    .map((entry) => {
      const currentAmount = Math.max(0, Number(entry.amount) || 0);
      const blocksFilled = blockValue > 0 ? Math.floor(currentAmount / blockValue) : 0;
      const overflow = blockValue > 0 ? currentAmount % blockValue : 0;
      return {
        id: crypto.randomUUID(),
        name: entry.name,
        currentAmount,
        blocksFilled,
        overflow,
        capacity: Math.max(blocksFilled, 1)
      };
    });

  return {
    id: existingId || crypto.randomUUID(),
    stackName: values.stackName,
    annualGoal,
    contributionFrequency: values.contributionFrequency,
    periodsPerYear,
    contributionPerPeriod,
    targetActionsPerYear: TARGET_ACTIONS_PER_YEAR,
    blockValue,
    cashAccumulated: 0,
    generatedBlocksAvailable: 0,
    monthCounter: 1,
    elapsedMsInYear: 0,
    elapsedMsInPeriod: 0,
    crates
  };
}

function getSelectedCustomRuntime() {
  return state.customRuntimes.find((runtime) => runtime.id === state.selectedCustomStackId) || null;
}

function saveCustomStacks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customRuntimes));
}

function normalizeLoadedStack(rawStack) {
  if (rawStack.annualGoal && rawStack.blockValue) {
    return {
      id: rawStack.id || crypto.randomUUID(),
      stackName: rawStack.stackName,
      annualGoal: Number(rawStack.annualGoal),
      contributionFrequency: rawStack.contributionFrequency,
      periodsPerYear: Number(rawStack.periodsPerYear),
      contributionPerPeriod: Number(rawStack.contributionPerPeriod),
      targetActionsPerYear: Number(rawStack.targetActionsPerYear || TARGET_ACTIONS_PER_YEAR),
      blockValue: Number(rawStack.blockValue),
      cashAccumulated: Number(rawStack.cashAccumulated || 0),
      generatedBlocksAvailable: Number(rawStack.generatedBlocksAvailable || 0),
      monthCounter: Number(rawStack.monthCounter || 1),
      elapsedMsInYear: Number(rawStack.elapsedMsInYear || 0),
      elapsedMsInPeriod: Number(rawStack.elapsedMsInPeriod || 0),
      crates: (rawStack.crates || []).map((crate) => ({
        id: crate.id || crypto.randomUUID(),
        name: crate.name,
        currentAmount: Number(crate.currentAmount || 0),
        blocksFilled: Number(crate.blocksFilled || 0),
        overflow: Number(crate.overflow || 0),
        capacity: Number(crate.capacity || Math.max(Number(crate.blocksFilled || 0), 1))
      }))
    };
  }

  const monthlyContribution = Number(rawStack.monthlyContribution || 0);
  const legacyAnnual = monthlyContribution * 12;
  const stack = {
    id: crypto.randomUUID(),
    stackName: rawStack.stackName,
    annualGoal: legacyAnnual,
    contributionFrequency: 'monthly',
    periodsPerYear: 12,
    contributionPerPeriod: monthlyContribution,
    targetActionsPerYear: TARGET_ACTIONS_PER_YEAR,
    blockValue: roundToNice(legacyAnnual / TARGET_ACTIONS_PER_YEAR),
    cashAccumulated: 0,
    generatedBlocksAvailable: 0,
    monthCounter: 1,
    elapsedMsInYear: 0,
    elapsedMsInPeriod: 0,
    crates: (rawStack.crates || []).map((crate) => {
      const currentAmount = Number(crate.totalAmount || 0);
      const blockValue = roundToNice(legacyAnnual / TARGET_ACTIONS_PER_YEAR);
      const blocksFilled = Math.floor(currentAmount / blockValue);
      return {
        id: crypto.randomUUID(),
        name: crate.name,
        currentAmount,
        blocksFilled,
        overflow: currentAmount % blockValue,
        capacity: Math.max(blocksFilled, 1)
      };
    })
  };
  return stack;
}

function loadCustomStacks() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    state.customRuntimes = parsed.map(normalizeLoadedStack);
  } catch {
    state.customRuntimes = [];
  }
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

function updateCustomStackTime(stack) {
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
}

function allocateBlockToCustomCrate(stack, crateName) {
  if (stack.generatedBlocksAvailable <= 0) return;
  const crate = stack.crates.find((entry) => entry.name === crateName);
  if (!crate) return;

  crate.blocksFilled += 1;
  crate.capacity = Math.max(crate.capacity, crate.blocksFilled);
  crate.currentAmount += stack.blockValue;
  crate.overflow = crate.currentAmount % stack.blockValue;
  stack.generatedBlocksAvailable -= 1;
  saveCustomStacks();
}

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

function renderCustomRuntime(stack) {
  const progress = Math.min(100, (stack.cashAccumulated / stack.blockValue) * 100);
  nodes.customMonthIndicator.textContent = `Month ${stack.monthCounter}`;
  nodes.customCashFill.style.width = `${progress}%`;
  nodes.customCashPercent.textContent = `${Math.round(progress)}%`;
  nodes.customCashStatus.textContent = stack.generatedBlocksAvailable > 0
    ? `${stack.generatedBlocksAvailable} Cash Block${stack.generatedBlocksAvailable > 1 ? 's' : ''} Ready`
    : `Accumulating cash: $${stack.cashAccumulated.toFixed(2)}`;

  nodes.customAvailableBlocks.innerHTML = '';
  for (let i = 0; i < stack.generatedBlocksAvailable; i += 1) {
    const block = document.createElement('div');
    block.className = 'block';
    block.id = `${stack.id}-available-${i}`;
    block.draggable = true;
    block.textContent = `$${stack.blockValue.toLocaleString()}`;
    block.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', 'custom-cash-block');
      event.dataTransfer.effectAllowed = 'move';
    });
    nodes.customAvailableBlocks.appendChild(block);
  }

  nodes.customCrateGrid.innerHTML = '';
  stack.crates.forEach((crate) => {
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
      allocateBlockToCustomCrate(stack, crate.name);
      render();
    });

    nodes.customCrateGrid.appendChild(node);
  });
}

function renderStacksList() {
  nodes.stacksList.innerHTML = '';

  if (state.customRuntimes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.innerHTML = 'No stacks yet. <button class="inline-link" id="buildOwn" type="button">Build your own?</button>';
    nodes.stacksList.appendChild(empty);
    document.getElementById('buildOwn').addEventListener('click', openCreateSurvey);
    nodes.customStackWorkspace.classList.add('hidden');
    return;
  }

  state.customRuntimes.forEach((stack) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `stack-card ${stack.id === state.selectedCustomStackId ? 'selected' : ''}`;
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
      state.selectedCustomStackId = stack.id;
      render();
    });
    nodes.stacksList.appendChild(card);
  });
}

function setTab(tab) {
  state.activeTab = tab;
  nodes.tabDemo.classList.toggle('is-active', tab === 'demo');
  nodes.tabMyStacks.classList.toggle('is-active', tab === 'my-stacks');
  nodes.demoView.classList.toggle('hidden', tab !== 'demo');
  nodes.myStacksView.classList.toggle('hidden', tab !== 'my-stacks');
}

function openCreateSurvey() {
  state.survey = {
    open: true,
    mode: 'create',
    step: 1,
    editingId: null,
    values: getEmptySurveyValues()
  };
  renderSurvey();
}

function openEditSurvey() {
  const stack = getSelectedCustomRuntime();
  if (!stack) return;

  state.survey = {
    open: true,
    mode: 'edit',
    step: 1,
    editingId: stack.id,
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
      investments: stack.crates.map((crate) => ({ name: crate.name, amount: String(crate.currentAmount) }))
    }
  };
  renderSurvey();
}

function renderSurvey() {
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
      renderSurvey();
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
        renderSurvey();
      });
    });

    if (values.annualGoal) {
      const periods = FREQUENCY_OPTIONS[values.contributionFrequency].periodsPerYear;
      const perPeriod = values.annualGoal / periods;
      document.getElementById('freqSummary').textContent = `Contribution per period: $${perPeriod.toFixed(2)}`;
    }
    return;
  }

  if (state.survey.step === 4) {
    const periods = FREQUENCY_OPTIONS[values.contributionFrequency].periodsPerYear;
    const perPeriod = values.annualGoal / periods;
    const blockValue = roundToNice(values.annualGoal / TARGET_ACTIONS_PER_YEAR);
    const periodUnit = FREQUENCY_OPTIONS[values.contributionFrequency].unitLabel;

    values.periodsPerYear = periods;
    values.contributionPerPeriod = perPeriod;
    values.blockValue = blockValue;

    nodes.surveyQuestion.textContent = 'Your investing action cadence';
    nodes.surveyContent.innerHTML = `
      <p class="survey-note">You’ll contribute about $${perPeriod.toFixed(2)} per ${periodUnit}.</p>
      <p class="survey-note">You’ll invest about $${(values.annualGoal / 12).toFixed(2)} each month (1 action block).</p>
      <p class="survey-note">Block value: $${blockValue.toLocaleString()}</p>
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
    renderSurvey();
  });
}

function validateAndAdvanceSurvey() {
  nodes.surveyError.textContent = '';
  const values = state.survey.values;

  if (state.survey.step === 1) {
    const name = document.getElementById('stackNameInput').value.trim();
    if (!name) return void (nodes.surveyError.textContent = 'Stack name is required.');
    const duplicate = state.customRuntimes.some((stack) => stack.stackName.toLowerCase() === name.toLowerCase() && stack.id !== state.survey.editingId);
    if (duplicate) return void (nodes.surveyError.textContent = 'Stack name must be unique.');
    values.stackName = name;
    state.survey.step += 1;
    return renderSurvey();
  }

  if (state.survey.step === 2) {
    const customInput = document.getElementById('annualGoalInput').value;
    const customAmount = customInput ? Number(customInput) : null;
    const annualGoal = customAmount && customAmount > 0 ? customAmount : values.annualGoalPreset;
    if (!annualGoal || annualGoal <= 0) return void (nodes.surveyError.textContent = 'Choose or enter an annual goal.');
    values.annualGoal = annualGoal;
    values.annualGoalInput = customInput;
    state.survey.step += 1;
    return renderSurvey();
  }

  if (state.survey.step < 5) {
    state.survey.step += 1;
    return renderSurvey();
  }

  const validRows = values.investments
    .map((row) => ({ name: row.name.trim(), amount: row.amount === '' ? '0' : row.amount }))
    .filter((row) => row.name);

  if (validRows.length === 0) return void (nodes.surveyError.textContent = 'Add at least one investment name.');

  values.investments = validRows;
  const built = buildStackFromSurvey(values, state.survey.mode === 'edit' ? state.survey.editingId : null);

  if (state.survey.mode === 'edit') {
    const existing = getSelectedCustomRuntime();
    const existingCash = existing ? existing.cashAccumulated : 0;
    const existingMonth = existing ? existing.monthCounter : 1;
    const existingProgress = existing ? existing.elapsedMsInPeriod : 0;

    built.cashAccumulated = existingCash;
    built.monthCounter = existingMonth;
    built.elapsedMsInPeriod = existingProgress;
    built.generatedBlocksAvailable = 0;

    const idx = state.customRuntimes.findIndex((stack) => stack.id === state.survey.editingId);
    if (idx >= 0) state.customRuntimes[idx] = built;
    state.selectedCustomStackId = built.id;
  } else {
    state.customRuntimes.push(built);
    state.selectedCustomStackId = built.id;
  }

  saveCustomStacks();
  state.survey.open = false;
  setTab('my-stacks');
  render();
}

function render() {
  renderDemo();
  renderStacksList();
  const selected = getSelectedCustomRuntime();

  if (!selected) {
    nodes.customStackWorkspace.classList.add('hidden');
  } else {
    nodes.customStackWorkspace.classList.remove('hidden');
    nodes.customCashTitle.textContent = `${selected.stackName} Cash Crate`;
    nodes.customBoardTitle.textContent = `${selected.stackName} Investment Crates`;
    renderCustomRuntime(selected);
  }
}

function tick() {
  updateDemoTime(state.demo);
  state.customRuntimes.forEach(updateCustomStackTime);
  saveCustomStacks();
  render();
}

nodes.tabDemo.addEventListener('click', () => setTab('demo'));
nodes.tabMyStacks.addEventListener('click', () => setTab('my-stacks'));
nodes.createStackBtn.addEventListener('click', openCreateSurvey);
nodes.editStackBtn.addEventListener('click', openEditSurvey);
nodes.surveyBack.addEventListener('click', () => {
  if (state.survey.step <= 1) return;
  state.survey.step -= 1;
  renderSurvey();
});
nodes.surveyNext.addEventListener('click', validateAndAdvanceSurvey);

nodes.createStackBtn.textContent = '+ Create New Stack';

loadCustomStacks();
if (state.customRuntimes[0]) state.selectedCustomStackId = state.customRuntimes[0].id;
render();
setInterval(tick, TICK_MS);
