import { createPortfolioQuickReport } from './portfolioQuickReport.js';
import { createInvestmentSettingsRow } from './investmentSettingsRow.js';

export function createPortfolioSettings({ rootNode, saveNode, cancelNode, deleteNode, addInvestmentNode, onSave, onCancel, onDeleteRequested, monthlyOptions }) {
  const nameInput = rootNode.querySelector('#portfolioSettingsName');
  const monthlySelect = rootNode.querySelector('#portfolioSettingsMonthly');
  const investmentsNode = rootNode.querySelector('#portfolioSettingsInvestments');
  const errorNode = rootNode.querySelector('#portfolioSettingsError');
  const quickReportNode = rootNode.querySelector('#portfolioQuickReport');
  const quickReport = createPortfolioQuickReport(quickReportNode);

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
      const row = createInvestmentSettingsRow({
        investment,
        index: idx,
        onNameInput: (event) => {
          draft.investments[Number(event.target.dataset.index)].name = event.target.value;
        },
        onPercentInput: (event) => {
          const eventIndex = Number(event.target.dataset.index);
          rebalanceFrom(eventIndex, Number(event.target.value));
          renderInvestments();
        },
        onExistingAmountInput: (event) => {
          const eventIndex = Number(event.target.dataset.index);
          draft.investments[eventIndex].existingAmount = Math.max(0, Number(event.target.value || 0));
        }
      });
      investmentsNode.appendChild(row);
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

  deleteNode.addEventListener('click', () => {
    if (!draft) return;
    onDeleteRequested(draft.stackId);
  });

  addInvestmentNode.addEventListener('click', () => {
    if (draft.investments.length >= 20) return;
    const next = draft.investments.length + 1;
    draft.investments.push({ name: '', targetPercent: 100 / next, existingAmount: 0 });
    draft.investments.forEach((item) => { item.targetPercent = 100 / next; });
    renderInvestments();
  });

  return {
    load(portfolio, report, suggestedExistingAmountsByCrateId = new Map()) {
      draft = {
        stackId: portfolio.stackId,
        stackName: portfolio.stackName,
        monthlyContribution: portfolio.monthlyContribution,
        investments: portfolio.cratesTemplate.map((crate) => ({
          crateId: crate.crateId,
          name: crate.name,
          targetPercent: crate.requestedPercent,
          existingAmount: Math.max(0, Number(
            suggestedExistingAmountsByCrateId.get(crate.crateId)
            ?? crate.existingAmount
            ?? 0
          ))
        }))
      };
      errorNode.textContent = '';
      nameInput.value = draft.stackName;
      monthlySelect.value = String(draft.monthlyContribution);
      quickReport.render(report);
      renderInvestments();
    }
  };
}
