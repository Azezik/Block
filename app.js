const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;

const initialCrates = [
  { id: 'HDIV', capacity: 6, filled: 0 },
  { id: 'VDY', capacity: 3, filled: 0 },
  { id: 'HCAL', capacity: 3, filled: 0 },
  { id: 'VFV', capacity: 3, filled: 0 },
  { id: 'TMFC', capacity: 2, filled: 0 },
  { id: 'PHYS', capacity: 2, filled: 0 },
  { id: 'YGOG', capacity: 1, filled: 0 },
  { id: 'YNVD', capacity: 1, filled: 0 },
  { id: 'YTSL', capacity: 1, filled: 0 },
  { id: 'YAMZ', capacity: 1, filled: 0 },
  { id: 'QQU', capacity: 1, filled: 0 }
];

/**
 * Stack (formalized UI concept):
 * A specific collection of crates, where each crate has a name (id)
 * and a bounded block-holding amount (capacity, filled).
 */
const state = {
  crates: initialCrates.map((crate) => ({ ...crate })),
  blocks: {
    available: new Set(),
    allocated: new Map()
  },
  time: {
    month: 1,
    progress: 0
  },
  nextBlockSerial: 0
};

const monthIndicator = document.getElementById('monthIndicator');
const cashFill = document.getElementById('cashFill');
const cashPercent = document.getElementById('cashPercent');
const cashStatus = document.getElementById('cashStatus');
const availableBlocks = document.getElementById('availableBlocks');
const crateGrid = document.getElementById('crateGrid');
const crateTemplate = document.getElementById('crateTemplate');

function getCrateById(crateId) {
  return state.crates.find((crate) => crate.id === crateId) || null;
}

function canAllocateToCrate(crateId) {
  const crate = getCrateById(crateId);
  return Boolean(crate) && crate.filled < crate.capacity;
}

function createCashBlock() {
  state.nextBlockSerial += 1;
  const blockId = `cash-block-${state.nextBlockSerial}`;
  state.blocks.available.add(blockId);
  return blockId;
}

function allocateBlockToCrate(blockId, crateId) {
  if (!state.blocks.available.has(blockId)) return false;
  if (!canAllocateToCrate(crateId)) return false;

  const crate = getCrateById(crateId);
  crate.filled += 1;
  state.blocks.available.delete(blockId);
  state.blocks.allocated.set(blockId, crateId);
  return true;
}

function updateTimeState() {
  const delta = (TICK_MS / MONTH_DURATION_MS) * 100;
  state.time.progress = Math.max(0, Math.min(100, state.time.progress + delta));

  if (state.time.progress >= 100) {
    createCashBlock();
    state.time.month += 1;
    state.time.progress = 0;
  }
}

function renderAvailableBlocks() {
  availableBlocks.innerHTML = '';

  state.blocks.available.forEach((blockId) => {
    const block = document.createElement('div');
    block.className = 'block';
    block.id = blockId;
    block.draggable = true;
    block.textContent = '$500';

    block.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', block.id);
      event.dataTransfer.effectAllowed = 'move';
    });

    availableBlocks.appendChild(block);
  });
}

function renderCrates() {
  crateGrid.innerHTML = '';

  state.crates.forEach((crate) => {
    const node = crateTemplate.content.firstElementChild.cloneNode(true);
    const label = node.querySelector('.crate-label');
    const count = node.querySelector('.crate-count');
    const slots = node.querySelector('.slots');

    label.textContent = crate.id;
    count.textContent = `${crate.filled}/${crate.capacity}`;

    for (let i = 0; i < crate.capacity; i += 1) {
      const slot = document.createElement('div');
      slot.className = `slot ${i < crate.filled ? 'filled' : ''}`.trim();
      slots.appendChild(slot);
    }

    node.dataset.crateId = crate.id;

    node.addEventListener('dragover', (event) => {
      if (!canAllocateToCrate(crate.id)) return;
      event.preventDefault();
      node.classList.add('over');
    });

    node.addEventListener('dragleave', () => {
      node.classList.remove('over');
    });

    node.addEventListener('drop', (event) => {
      event.preventDefault();
      node.classList.remove('over');

      const blockId = event.dataTransfer.getData('text/plain');
      const didAllocate = allocateBlockToCrate(blockId, crate.id);
      if (!didAllocate) return;

      render();
    });

    crateGrid.appendChild(node);
  });
}

function renderTimeAndStatus() {
  monthIndicator.textContent = `Month ${state.time.month}`;
  cashFill.style.height = `${state.time.progress}%`;
  cashPercent.textContent = `${Math.round(state.time.progress)}%`;

  const availableCount = state.blocks.available.size;
  cashStatus.textContent = availableCount > 0
    ? `${availableCount} Cash Block${availableCount > 1 ? 's' : ''} Ready`
    : 'Filling...';
}

function render() {
  renderTimeAndStatus();
  renderAvailableBlocks();
  renderCrates();
}

function tick() {
  updateTimeState();
  render();
}

render();
setInterval(tick, TICK_MS);
