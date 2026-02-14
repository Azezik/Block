export function createPortfolioSettings({ rootNode, saveNode, cancelNode, addInvestmentNode, onSave, onCancel, monthlyOptions }) {
  const nameInput = rootNode.querySelector('#portfolioSettingsName');
  const monthlySelect = rootNode.querySelector('#portfolioSettingsMonthly');
  const investmentsNode = rootNode.querySelector('#portfolioSettingsInvestments');
  const errorNode = rootNode.querySelector('#portfolioSettingsError');

  monthlySelect.innerHTML = monthlyOptions
    .map((amount) => `<option value="${amount}">$${amount.toLocaleString()}</option>`)
    .join('');

  let draft = null;

  function rebalanceFrom(index, value) {
    const bounded = Math.max(0, Math.min(100, value));
    const others = draft.investments.reduce((sum, item, idx) => sum + (idx === index ? 0 : item.targetPercent), 0);
    const targetOthers = 100 - bounded;
    if (draft.investments.length === 1) {
      draft.investments[0].targetPercent = 100;
      return;
    }
    if (others <= 0) {
      const even = targetOthers / (draft.investments.length - 1);
      draft.investments.forEach((item, idx) => { item.targetPercent = idx === index ? bounded : even; });
    } else {
      draft.investments.forEach((item, idx) => {
        if (idx === index) item.targetPercent = bounded;
        else item.targetPercent = (item.targetPercent / others) * targetOthers;
      });
    }
    const total = draft.investments.reduce((sum, item) => sum + item.targetPercent, 0);
    draft.investments[draft.investments.length - 1].targetPercent += (100 - total);
  }

  function renderInvestments() {
    investmentsNode.innerHTML = '';
    draft.investments.forEach((investment, idx) => {
      const row = document.createElement('div');
      row.className = 'investment-row';
      row.innerHTML = `<input class="field" data-role="name" data-index="${idx}" value="${investment.name}" placeholder="Investment name"><input class="field" data-role="pct" data-index="${idx}" type="number" min="0" max="100" step="0.1" value="${investment.targetPercent.toFixed(1)}">`;
      investmentsNode.appendChild(row);
    });

    investmentsNode.querySelectorAll('[data-role="name"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        draft.investments[Number(event.target.dataset.index)].name = event.target.value;
      });
    });
    investmentsNode.querySelectorAll('[data-role="pct"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const idx = Number(event.target.dataset.index);
        rebalanceFrom(idx, Number(event.target.value));
        renderInvestments();
      });
    });
  }

  saveNode.addEventListener('click', () => {
    errorNode.textContent = '';
    draft.stackName = nameInput.value;
    draft.monthlyContribution = Number(monthlySelect.value);
    const err = onSave(draft);
    if (err) errorNode.textContent = err;
  });

  cancelNode.addEventListener('click', onCancel);

  addInvestmentNode.addEventListener('click', () => {
    if (draft.investments.length >= 20) return;
    const next = draft.investments.length + 1;
    draft.investments.push({ name: '', targetPercent: 100 / next, existingAmount: 0 });
    draft.investments.forEach((item) => { item.targetPercent = 100 / next; });
    renderInvestments();
  });

  return {
    load(portfolio) {
      draft = {
        stackId: portfolio.stackId,
        stackName: portfolio.stackName,
        monthlyContribution: portfolio.monthlyContribution,
        investments: portfolio.cratesTemplate.map((crate) => ({
          crateId: crate.crateId,
          name: crate.name,
          targetPercent: crate.requestedPercent,
          existingAmount: Number(crate.existingAmount || 0)
        }))
      };
      errorNode.textContent = '';
      nameInput.value = draft.stackName;
      monthlySelect.value = String(draft.monthlyContribution);
      renderInvestments();
    }
  };
}
