export function createOverflowBlockNode(block, draggable = true) {
  const node = document.createElement('div');
  node.className = 'block overflow-block';
  node.draggable = draggable;
  node.textContent = block.crateName;
  node.dataset.overflowId = block.id;
  return node;
}
