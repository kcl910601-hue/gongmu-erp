"use client";

import { useState } from "react";

export function useBulkSelection<T extends string | number>() {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(() => new Set());
  const [lastSelectedId, setLastSelectedId] = useState<T | null>(null);

  function toggle(id: T, pageIds: T[], shiftKey = false) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (shiftKey && lastSelectedId !== null) {
        const startIndex = pageIds.indexOf(lastSelectedId);
        const endIndex = pageIds.indexOf(id);
        if (startIndex >= 0 && endIndex >= 0) {
          const [start, end] =
            startIndex <= endIndex
              ? [startIndex, endIndex]
              : [endIndex, startIndex];
          pageIds.slice(start, end + 1).forEach((pageId) => next.add(pageId));
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastSelectedId(id);
  }

  function togglePage(pageIds: T[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const isPageSelected =
        pageIds.length > 0 && pageIds.every((id) => current.has(id));
      if (isPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clear() {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggle,
    togglePage,
    clear,
  };
}
