function formatCurrency(amount) {
  return `$${Math.round(Number(amount) || 0).toLocaleString()}`;
}

export function createPortfolioQuickReport(rootNode) {
  return {
    render(report) {
      if (!rootNode) return;

      rootNode.innerHTML = `
        <h3 class="quick-report-title">Quick Progress Report</h3>
        <div class="quick-report-summary">
          <p><span>Total Portfolio Value</span><strong>${formatCurrency(report?.totalPortfolioValue)}</strong></p>
          <p><span>Total Invested</span><strong>${formatCurrency(report?.totalInvestedValue)}</strong></p>
          <p><span>Total Cash</span><strong>${formatCurrency(report?.totalCashValue)}</strong></p>
          <p><span>Full Stack Value (max)</span><strong>${formatCurrency(report?.fullStackValue)}</strong></p>
        </div>
        <div class="quick-report-crates">
          ${(report?.perCrate || []).map((crate) => `
            <p>
              <span>${crate.crateName}</span>
              <strong>${formatCurrency(crate.currentValue)} / ${formatCurrency(crate.maxValue)}</strong>
            </p>
          `).join('')}
        </div>
      `;
    }
  };
}
