const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;
const STORAGE_KEY = 'block.custom.stacks.v1';

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
  demo: makeRuntime({
    stackName: 'Demo Stack',
    monthlyContribution: 500,
    crates: initialDemoCrates,
    hardCapacity: true
  }),
  customRuntimes: [],
  selectedCustomStackId: null,
  survey: {
    open: false,
    mode: 'create',
    step: 1,
    editingId: null,
    values: { stackName: '', monthlyContribution: null, customContribution: '', investments: [{ name: '', amount: '' }] }
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

function makeRuntime(stackObj) {
  return {
    id: crypto.randomUUID(),
    stackName: stackObj.stackName,
    monthlyContribution: stackObj.monthlyContribution,
    hardCapacity: Boolean(stackObj.hardCapacity),
    crates: stackObj.crates.map((crate) => ({
      name: crate.name,
      totalAmount: crate.totalAmount,
      blocksFilled: crate.blocksFilled,
      overflow: crate.overflow,
      capacity: crate.capacity ?? Math.max(crate.blocksFilled, 1)
    })),
    blocks: { available: new Set(), allocated: new Map() },
    time: { month: 1, progress: 0 },
    nextBlockSerial: 0
  };
}

function stackObjectFromRuntime(runtime) {
  return {
    stackName: runtime.stackName,
    monthlyContribution: runtime.monthlyContribution,
    crates: runtime.crates.map((crate) => ({
      name: crate.name,
      totalAmount: crate.totalAmount,
      blocksFilled: crate.blocksFilled,
      overflow: crate.overflow
    }))
  };
}

function loadCustomStacks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    state.customRuntimes = parsed.map((stack) => makeRuntime(stack));
  } catch {
    state.customRuntimes = [];
  }
}

function saveCustomStacks() {
  const portable = state.customRuntimes.map((runtime) => stackObjectFromRuntime(runtime));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(portable));
}

function getRuntimeCrate(runtime, name) {
  return runtime.crates.find((crate) => crate.name === name) || null;
}

function createCashBlock(runtime) {
  runtime.nextBlockSerial += 1;
  const blockId = `${runtime.id}-cash-block-${runtime.nextBlockSerial}`;
  runtime.blocks.available.add(blockId);
}

function canAllocateToCrate(runtime, crateName) {
  const crate = getRuntimeCrate(runtime, crateName);
  if (!crate) return false;
  if (!runtime.hardCapacity) return true;
  return crate.blocksFilled < crate.capacity;
}

function allocateBlockToCrate(runtime, blockId, crateName) {
  if (!runtime.blocks.available.has(blockId) || !canAllocateToCrate(runtime, crateName)) return;
  const crate = getRuntimeCrate(runtime, crateName);
  crate.blocksFilled += 1;
  crate.totalAmount += runtime.monthlyContribution;
  if (!runtime.hardCapacity) crate.capacity = crate.blocksFilled;
  runtime.blocks.available.delete(blockId);
  runtime.blocks.allocated.set(blockId, crateName);

  if (!runtime.hardCapacity) saveCustomStacks();
}

function updateRuntimeTime(runtime) {
  const delta = (TICK_MS / MONTH_DURATION_MS) * 100;
  runtime.time.progress = Math.min(100, runtime.time.progress + delta);
  if (runtime.time.progress >= 100) {
    createCashBlock(runtime);
    runtime.time.month += 1;
    runtime.time.progress = 0;
  }
}

function renderRuntime(runtime, target) {
  target.month.textContent = `Month ${runtime.time.month}`;
  target.fill.style.width = `${runtime.time.progress}%`;
  target.percent.textContent = `${Math.round(runtime.time.progress)}%`;

  const availableCount = runtime.blocks.available.size;
  target.status.textContent = availableCount > 0
    ? `${availableCount} Cash Block${availableCount > 1 ? 's' : ''} Ready`
    : 'Filling...';

  target.available.innerHTML = '';
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
    target.available.appendChild(block);
  });

  target.grid.innerHTML = '';
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
      if (!canAllocateToCrate(runtime, crate.name)) return;
      event.preventDefault();
      node.classList.add('over');
    });
    node.addEventListener('dragleave', () => node.classList.remove('over'));
    node.addEventListener('drop', (event) => {
      event.preventDefault();
      node.classList.remove('over');
      allocateBlockToCrate(runtime, event.dataTransfer.getData('text/plain'), crate.name);
      render();
    });

    target.grid.appendChild(node);
  });
}

function renderStacksList() {
  nodes.stacksList.innerHTML = '';

  if (state.customRuntimes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.innerHTML = 'No stacks yet.<br/><button class="inline-link" id="buildOwn" type="button">Build your own?</button>';
    nodes.stacksList.appendChild(empty);
    document.getElementById('buildOwn').addEventListener('click', openCreateSurvey);
    nodes.customStackWorkspace.classList.add('hidden');
    return;
  }

  state.customRuntimes.forEach((runtime) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `stack-card ${runtime.id === state.selectedCustomStackId ? 'selected' : ''}`;
    card.innerHTML = `<strong>${runtime.stackName}</strong><span>Monthly: $${runtime.monthlyContribution.toLocaleString()}</span><span>Crates: ${runtime.crates.length}</span>`;
    card.addEventListener('click', () => {
      state.selectedCustomStackId = runtime.id;
      render();
    });
    nodes.stacksList.appendChild(card);
  });
}

function getSelectedCustomRuntime() {
  return state.customRuntimes.find((runtime) => runtime.id === state.selectedCustomStackId) || null;
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
    values: { stackName: '', monthlyContribution: null, customContribution: '', investments: [{ name: '', amount: '' }] }
  };
  renderSurvey();
}

function openEditSurvey() {
  const runtime = getSelectedCustomRuntime();
  if (!runtime) return;

  state.survey = {
    open: true,
    mode: 'edit',
    step: 1,
    editingId: runtime.id,
    values: {
      stackName: runtime.stackName,
      monthlyContribution: runtime.monthlyContribution,
      customContribution: String(runtime.monthlyContribution),
      investments: runtime.crates.map((crate) => ({ name: crate.name, amount: String(crate.totalAmount) }))
    }
  };
  renderSurvey();
}

function renderSurvey() {
  nodes.surveyModal.classList.toggle('hidden', !state.survey.open);
  nodes.surveyError.textContent = '';
  nodes.surveyBack.style.visibility = state.survey.step === 1 ? 'hidden' : 'visible';
  nodes.surveyNext.textContent = state.survey.step === 3 ? 'Save Stack' : 'Save / Continue';

  if (state.survey.step === 1) {
    nodes.surveyQuestion.textContent = 'What would you like to name this stack?';
    nodes.surveyContent.innerHTML = `<input id="stackNameInput" class="field" type="text" placeholder="Long-Term Growth" value="${state.survey.values.stackName}"/>`;
    return;
  }

  if (state.survey.step === 2) {
    const presets = [50, 100, 200, 250, 500, 1000, 1500, 2000]
      .map((amount) => `<button class="preset ${state.survey.values.monthlyContribution === amount ? 'selected' : ''}" data-amount="${amount}" type="button">$${amount.toLocaleString()}</button>`)
      .join('');
    nodes.surveyQuestion.textContent = 'How much do you plan to invest each month?';
    nodes.surveyContent.innerHTML = `<div class="preset-wrap">${presets}</div><input id="customContributionInput" class="field" type="number" min="1" step="1" placeholder="Custom amount" value="${state.survey.values.customContribution}"/>`;
    nodes.surveyContent.querySelectorAll('.preset').forEach((btn) => btn.addEventListener('click', () => {
      state.survey.values.monthlyContribution = Number(btn.dataset.amount);
      state.survey.values.customContribution = '';
      renderSurvey();
    }));
    return;
  }

  nodes.surveyQuestion.textContent = 'What investments do you have or plan to invest in?';
  nodes.surveyContent.innerHTML = `
    <div id="investmentRows">
      ${state.survey.values.investments.map((row, idx) => `
        <div class="investment-row">
          <input class="field inv-name" data-index="${idx}" type="text" placeholder="Investment Name" value="${row.name}">
          <input class="field inv-amount" data-index="${idx}" type="number" min="0" step="1" placeholder="Current Amount Invested" value="${row.amount}">
        </div>
      `).join('')}
    </div>
    <button id="addInvestment" class="btn btn-soft" type="button">Add Investment</button>
  `;
  nodes.surveyContent.querySelectorAll('.inv-name').forEach((input) => input.addEventListener('input', (event) => {
    state.survey.values.investments[Number(event.target.dataset.index)].name = event.target.value;
  }));
  nodes.surveyContent.querySelectorAll('.inv-amount').forEach((input) => input.addEventListener('input', (event) => {
    state.survey.values.investments[Number(event.target.dataset.index)].amount = event.target.value;
  }));
  document.getElementById('addInvestment').addEventListener('click', () => {
    state.survey.values.investments.push({ name: '', amount: '' });
    renderSurvey();
  });
}

function handleSurveyNext() {
  nodes.surveyError.textContent = '';

  if (state.survey.step === 1) {
    const name = document.getElementById('stackNameInput').value.trim();
    if (!name) return void (nodes.surveyError.textContent = 'Stack name is required.');
    const duplicate = state.customRuntimes.some((runtime) => runtime.stackName.toLowerCase() === name.toLowerCase() && runtime.id !== state.survey.editingId);
    if (duplicate) return void (nodes.surveyError.textContent = 'Stack name must be unique.');
    state.survey.values.stackName = name;
    state.survey.step = 2;
    return renderSurvey();
  }

  if (state.survey.step === 2) {
    const customInput = document.getElementById('customContributionInput').value;
    const custom = customInput ? Number(customInput) : null;
    const contribution = custom && custom > 0 ? custom : state.survey.values.monthlyContribution;
    if (!contribution || contribution <= 0) return void (nodes.surveyError.textContent = 'Choose or enter a monthly contribution.');
    state.survey.values.monthlyContribution = contribution;
    state.survey.values.customContribution = customInput;
    state.survey.step = 3;
    return renderSurvey();
  }

  const validRows = state.survey.values.investments
    .map((row) => ({ name: row.name.trim(), amount: row.amount === '' ? '0' : row.amount }))
    .filter((row) => row.name);

  if (validRows.length === 0) return void (nodes.surveyError.textContent = 'Add at least one investment name.');

  const monthlyContribution = state.survey.values.monthlyContribution;
  const crates = validRows.map((row) => {
    const totalAmount = Math.max(0, Number(row.amount) || 0);
    const blocksFilled = Math.floor(totalAmount / monthlyContribution);
    return {
      name: row.name,
      totalAmount,
      blocksFilled,
      overflow: totalAmount % monthlyContribution,
      capacity: Math.max(blocksFilled, 1)
    };
  });

  const runtime = makeRuntime({
    stackName: state.survey.values.stackName,
    monthlyContribution,
    crates,
    hardCapacity: false
  });

  if (state.survey.mode === 'edit') {
    const idx = state.customRuntimes.findIndex((entry) => entry.id === state.survey.editingId);
    if (idx >= 0) state.customRuntimes[idx] = { ...runtime, id: state.survey.editingId };
    state.selectedCustomStackId = state.survey.editingId;
  } else {
    state.customRuntimes.push(runtime);
    state.selectedCustomStackId = runtime.id;
  }

  saveCustomStacks();
  state.survey.open = false;
  setTab('my-stacks');
  render();
}

function render() {
  renderRuntime(state.demo, {
    month: nodes.monthIndicator,
    fill: nodes.cashFill,
    percent: nodes.cashPercent,
    status: nodes.cashStatus,
    available: nodes.availableBlocks,
    grid: nodes.crateGrid
  });

  renderStacksList();
  const selected = getSelectedCustomRuntime();
  if (!selected) {
    nodes.customStackWorkspace.classList.add('hidden');
  } else {
    nodes.customStackWorkspace.classList.remove('hidden');
    nodes.customCashTitle.textContent = `${selected.stackName} Cash Crate`;
    nodes.customBoardTitle.textContent = `${selected.stackName} Investment Crates`;
    renderRuntime(selected, {
      month: nodes.customMonthIndicator,
      fill: nodes.customCashFill,
      percent: nodes.customCashPercent,
      status: nodes.customCashStatus,
      available: nodes.customAvailableBlocks,
      grid: nodes.customCrateGrid
    });
  }
}

function tick() {
  if (state.activeTab === 'demo') updateRuntimeTime(state.demo);
  const selected = getSelectedCustomRuntime();
  if (state.activeTab === 'my-stacks' && selected) updateRuntimeTime(selected);
  render();
}

nodes.tabDemo.addEventListener('click', () => setTab('demo'));
nodes.tabMyStacks.addEventListener('click', () => setTab('my-stacks'));
nodes.createStackBtn.addEventListener('click', openCreateSurvey);
nodes.editStackBtn.addEventListener('click', openEditSurvey);
nodes.surveyBack.addEventListener('click', () => {
  state.survey.step -= 1;
  renderSurvey();
});
nodes.surveyNext.addEventListener('click', handleSurveyNext);

loadCustomStacks();
if (state.customRuntimes[0]) state.selectedCustomStackId = state.customRuntimes[0].id;
render();
setInterval(tick, TICK_MS);
