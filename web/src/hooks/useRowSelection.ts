import { useCallback, useMemo, useState } from "react";

export function useRowSelection(pageIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));
  const somePageSelected = pageIds.some((id) => selectedSet.has(id));

  const isSelected = useCallback((id: string) => selectedSet.has(id), [selectedSet]);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }, []);

  const toggleAllPage = useCallback(() => {
    setSelectedIds((current) => {
      if (pageIds.length === 0) return current;
      const allSelected = pageIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !pageIds.includes(id));
      }
      return Array.from(new Set([...current, ...pageIds]));
    });
  }, [pageIds]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  return {
    selectedIds,
    setSelectedIds,
    isSelected,
    allPageSelected,
    somePageSelected,
    toggleRow,
    toggleAllPage,
    clearSelection,
  };
}
