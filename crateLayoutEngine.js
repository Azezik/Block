export function computeCrateLayout(blockCount) {
  const safeCount = Number.isFinite(blockCount) ? Math.max(0, Math.floor(blockCount)) : 0;
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(safeCount)));
  const totalCells = gridSize * gridSize;

  const cells = Array.from({ length: totalCells }, (_, index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    const filled = index < safeCount;

    return {
      row,
      col,
      filled,
      empty: !filled
    };
  });

  return {
    gridSize,
    cells
  };
}
