export const CALENDAR_TASK_STACK_GAP = 4;

export type VariableStackItem = {
  id: string;
  startColumn: number;
  span: number;
  laneIndex: number;
  height: number;
};

export function calculateVariableStack(items: VariableStackItem[], gap = CALENDAR_TASK_STACK_GAP) {
  const sorted = [...items].sort((left, right) => left.laneIndex - right.laneIndex || left.startColumn - right.startColumn);
  const offsets = new Map<string, number>();

  for (const item of sorted) {
    const itemEnd = item.startColumn + item.span;
    let top = 0;
    for (const previous of sorted) {
      if (previous.laneIndex >= item.laneIndex) break;
      const previousEnd = previous.startColumn + previous.span;
      const overlaps = previous.startColumn < itemEnd && item.startColumn < previousEnd;
      if (overlaps) top = Math.max(top, (offsets.get(previous.id) ?? 0) + previous.height + gap);
    }
    offsets.set(item.id, top);
  }

  return {
    offsets,
    height: sorted.reduce((maximum, item) => Math.max(maximum, (offsets.get(item.id) ?? 0) + item.height), 0),
  };
}
