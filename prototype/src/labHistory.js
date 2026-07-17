export function createHistory(maxDepth = 50) {
  let undoStack = [];
  let redoStack = [];
  let current = null;

  function push(snapshot) {
    if (current) undoStack.push(current);
    if (undoStack.length > maxDepth) undoStack.shift();
    current = structuredClone(snapshot);
    redoStack = [];
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function undo() {
    if (!canUndo()) return null;
    redoStack.push(current);
    current = undoStack.pop();
    return structuredClone(current);
  }

  function redo() {
    if (!canRedo()) return null;
    undoStack.push(current);
    current = redoStack.pop();
    return structuredClone(current);
  }

  return { push, undo, redo, canUndo, canRedo };
}
