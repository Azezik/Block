export function renderTradeLog(node, log = []) {
  node.innerHTML = '';
  if (!log.length) {
    node.innerHTML = '<p class="hint">No trading actions yet.</p>';
    return;
  }

  const list = document.createElement('ol');
  list.className = 'trade-log-list';
  log.forEach((entry) => {
    const row = document.createElement('li');
    row.className = 'trade-log-item';
    row.textContent = entry;
    list.appendChild(row);
  });
  node.appendChild(list);
}
