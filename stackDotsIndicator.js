export function renderStackDots({
  containerNode,
  stacks,
  currentStackId,
  isStackComplete,
  onSelectStack
}) {
  if (!containerNode) return;

  containerNode.innerHTML = '';

  if (!Array.isArray(stacks) || stacks.length <= 1) {
    containerNode.classList.add('hidden');
    return;
  }

  containerNode.classList.remove('hidden');

  stacks.forEach((stack, index) => {
    const stackId = stack?.cardId;
    if (!stackId) return;

    const complete = Boolean(isStackComplete?.(stack));
    const isActive = stackId === currentStackId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stack-progress-dot';
    if (complete) button.classList.add('is-complete');
    if (isActive) button.classList.add('is-active');

    const statusLabel = complete ? 'Complete' : 'In progress';
    const stackLabel = `Stack ${index + 1}`;
    button.setAttribute('aria-label', `Go to ${stackLabel}`);
    button.title = `${stackLabel} · ${statusLabel}`;

    button.addEventListener('click', () => {
      onSelectStack?.(stackId);
    });

    containerNode.appendChild(button);
  });
}
