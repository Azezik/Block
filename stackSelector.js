export function createStackSelector({ buttonNode, menuNode, onSelect }) {
  let portfolios = [];
  let selectedId = null;

  function closeMenu() {
    menuNode.classList.add('hidden');
    buttonNode.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    if (portfolios.length <= 1) return;
    menuNode.classList.remove('hidden');
    buttonNode.setAttribute('aria-expanded', 'true');
  }

  function render() {
    const selected = portfolios.find((portfolio) => portfolio.stackId === selectedId);
    buttonNode.textContent = selected ? selected.stackName : 'Select Stack Portfolio';
    buttonNode.disabled = portfolios.length <= 1;

    menuNode.innerHTML = '';
    portfolios
      .filter((portfolio) => portfolio.stackId !== selectedId)
      .forEach((portfolio) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'selector-menu-item';
        item.textContent = portfolio.stackName;
        item.addEventListener('click', () => {
          closeMenu();
          onSelect(portfolio.stackId);
        });
        menuNode.appendChild(item);
      });
  }

  buttonNode.addEventListener('click', () => {
    if (menuNode.classList.contains('hidden')) openMenu();
    else closeMenu();
  });

  document.addEventListener('click', (event) => {
    if (!menuNode.classList.contains('hidden') && !menuNode.contains(event.target) && event.target !== buttonNode) {
      closeMenu();
    }
  });

  return {
    setData(nextPortfolios, nextSelectedId) {
      portfolios = nextPortfolios;
      selectedId = nextSelectedId;
      render();
      closeMenu();
    },
    closeMenu
  };
}
