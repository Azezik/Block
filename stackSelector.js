export function createStackSelector({ buttonNode, menuNode, onSelect }) {
  let portfolios = [];
  let selectedId = null;

  function isMenuOpen() {
    return !menuNode.classList.contains('hidden');
  }

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
    if (!isMenuOpen()) openMenu();
    else closeMenu();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isMenuOpen()) return;

    if (!menuNode.contains(event.target) && !buttonNode.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!isMenuOpen()) return;
    if (event.key !== 'Escape') return;
    closeMenu();
    buttonNode.focus();
  });

  return {
    setData(nextPortfolios, nextSelectedId) {
      const wasOpen = isMenuOpen();
      portfolios = nextPortfolios;
      selectedId = nextSelectedId;
      render();

      if (portfolios.length <= 1) {
        closeMenu();
        return;
      }

      if (wasOpen) openMenu();
      else closeMenu();
    },
    closeMenu
  };
}
