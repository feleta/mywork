export function generateId() {
  return 'task-' + Math.random().toString(36).slice(2, 8);
}
