export function createStackCarousel({ trackNode, prevNode, nextNode, onActiveCardChanged, renderCard }) {
  let cards = [];
  let activeIndex = 0;

  function clampIndex(idx) {
    if (!cards.length) return 0;
    return Math.max(0, Math.min(cards.length - 1, idx));
  }

  function updateNav() {
    prevNode.disabled = activeIndex <= 0;
    nextNode.disabled = activeIndex >= cards.length - 1;
  }

  function render() {
    trackNode.innerHTML = '';
    cards.forEach((card, idx) => {
      const shell = document.createElement('article');
      shell.className = `stack-carousel-card ${idx === activeIndex ? 'active' : ''}`;
      shell.dataset.index = String(idx);
      renderCard(shell, card, idx, idx === activeIndex);
      trackNode.appendChild(shell);
    });
    const offsetPct = -(activeIndex * 100);
    trackNode.style.transform = `translateX(${offsetPct}%)`;
    updateNav();
  }

  function setActiveIndex(idx, emit = true) {
    activeIndex = clampIndex(idx);
    render();
    if (emit) onActiveCardChanged(activeIndex);
  }

  prevNode.addEventListener('click', () => setActiveIndex(activeIndex - 1));
  nextNode.addEventListener('click', () => setActiveIndex(activeIndex + 1));

  let dragStartX = null;
  trackNode.addEventListener('pointerdown', (event) => {
    dragStartX = event.clientX;
  });
  trackNode.addEventListener('pointerup', (event) => {
    if (dragStartX == null) return;
    const delta = event.clientX - dragStartX;
    if (delta > 40) setActiveIndex(activeIndex - 1);
    if (delta < -40) setActiveIndex(activeIndex + 1);
    dragStartX = null;
  });

  return {
    setCards(nextCards, nextActiveIndex = 0) {
      cards = nextCards;
      activeIndex = clampIndex(nextActiveIndex);
      render();
    },
    getActiveIndex() {
      return activeIndex;
    }
  };
}
