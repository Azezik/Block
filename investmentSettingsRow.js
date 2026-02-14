export function createInvestmentSettingsRow({ investment, index, onNameInput, onPercentInput, onExistingAmountInput }) {
  const row = document.createElement('div');
  row.className = 'investment-row';
  row.innerHTML = `
    <input class="field" data-role="name" data-index="${index}" value="${investment.name}" placeholder="Investment name">
    <input class="field" data-role="pct" data-index="${index}" type="number" min="0" max="100" step="0.1" value="${investment.targetPercent.toFixed(1)}" aria-label="Target allocation percent for ${investment.name || `investment ${index + 1}`}">
    <input class="field" data-role="existing" data-index="${index}" type="number" min="0" step="1" value="${Math.max(0, Number(investment.existingAmount || 0))}" placeholder="Existing amount" aria-label="Existing amount for ${investment.name || `investment ${index + 1}`}">
  `;

  row.querySelector('[data-role="name"]').addEventListener('input', onNameInput);
  row.querySelector('[data-role="pct"]').addEventListener('input', onPercentInput);
  row.querySelector('[data-role="existing"]').addEventListener('input', onExistingAmountInput);

  return row;
}
