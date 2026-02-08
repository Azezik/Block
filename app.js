const MONTH_DURATION_MS = 15000;
const TICK_MS = 100;

const crates = [
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

const monthIndicator = document.getElementById('monthIndicator');
const cashFill = document.getElementById('cashFill');
const cashPercent = document.getElementById('cashPercent');
const cashStatus = document.getElementById('cashStatus');
const availableBlocks = document.getElementById('availableBlocks');
const crateGrid = document.getElementById('crateGrid');
const crateTemplate = document.getElementById('crateTemplate');

let month = 1;
let progress = 0;
let blockSerial = 0;
let blockAvailable = false;

function renderCrates() {
  crateGrid.innerHTML = '';

  crates.forEach((crate) => {
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
      if (crate.filled >= crate.capacity) return;
      event.preventDefault();
      node.classList.add('over');
    });

    node.addEventListener('dragleave', () => {
      node.classList.remove('over');
    });

    node.addEventListener('drop', (event) => {
      event.preventDefault();
      node.classList.remove('over');
      if (crate.filled >= crate.capacity) return;

      const blockId = event.dataTransfer.getData('text/plain');
      const block = document.getElementById(blockId);
      if (!block) return;

      crate.filled += 1;
      block.remove();
      blockAvailable = false;
      renderCrates();
      updateCashStatus();
      resetCashCrateForNextMonth();
    });

    crateGrid.appendChild(node);
  });
}

function spawnCashBlock() {
  blockSerial += 1;
  const block = document.createElement('div');
  block.className = 'block';
  block.id = `cash-block-${blockSerial}`;
  block.draggable = true;
  block.textContent = '$500';

  block.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', block.id);
    event.dataTransfer.effectAllowed = 'move';
  });

  availableBlocks.appendChild(block);
  blockAvailable = true;
  updateCashStatus();
}

function updateCashStatus() {
  cashStatus.textContent = blockAvailable ? 'Crate Full - Place Cash Block' : 'Filling...';
}

function setProgress(percent) {
  progress = Math.max(0, Math.min(100, percent));
  cashFill.style.height = `${progress}%`;
  cashPercent.textContent = `${Math.round(progress)}%`;
}

function resetCashCrateForNextMonth() {
  setProgress(0);
}

function tick() {
  if (blockAvailable) {
    return;
  }

  const delta = (TICK_MS / MONTH_DURATION_MS) * 100;
  setProgress(progress + delta);

  if (progress >= 100) {
    setProgress(100);
    spawnCashBlock();
    month += 1;
    monthIndicator.textContent = `Month ${month}`;
  }
}

renderCrates();
updateCashStatus();
setInterval(tick, TICK_MS);
