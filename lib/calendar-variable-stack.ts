export const CALENDAR_TASK_STACK_GAP = 4;

export type VariableStackItem = {
  id: string;
  startColumn: number;
  span: number;
  laneIndex: number;
  height: number;
};

export function getCalendarSegmentKey(itemId: string, weekIndex: number) {
  return `${itemId}-week-${weekIndex}`;
}

export function orderVariableStackItems(items: VariableStackItem[]) {
  return [...items].sort((left, right) =>
    left.startColumn - right.startColumn ||
    right.span - left.span ||
    left.id.localeCompare(right.id)
  );
}

export function calculateVariableStack(items: VariableStackItem[], gap = CALENDAR_TASK_STACK_GAP) {
  const sorted = orderVariableStackItems(items);
  const offsets = new Map<string, number>();

  sorted.forEach((item, itemIndex) => {
    const itemEnd = item.startColumn + item.span;
    let top = 0;
    for (const previous of sorted.slice(0, itemIndex)) {
      const previousEnd = previous.startColumn + previous.span;
      const overlaps = previous.startColumn < itemEnd && item.startColumn < previousEnd;
      if (overlaps) top = Math.max(top, (offsets.get(previous.id) ?? 0) + previous.height + gap);
    }
    offsets.set(item.id, top);
  });

  return {
    offsets,
    height: sorted.reduce((maximum, item) => Math.max(maximum, (offsets.get(item.id) ?? 0) + item.height), 0),
  };
}
