import { useCallback, useMemo, useState } from 'react';
import { getSelectableIds } from '../utils/runs.utils';

/** Select mode for deleting runs from the chat. */
export function useRunSelection(runs, deleteMessages) {
  const [isActive, setIsActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const selectableIds = useMemo(() => getSelectableIds(runs), [runs]);
  const allSelected = selectableIds.length > 0 && selectedIds.size === selectableIds.length;

  const toggleMode = useCallback(() => {
    setIsActive((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  const toggleRun = useCallback((runId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  }, [allSelected, selectableIds]);

  const deleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const messageIds = runs
      .filter((run) => selectedIds.has(run.id))
      .flatMap((run) => [run.id, run.assistant?.id || run.assistant?._id])
      .filter(Boolean);
    if (messageIds.length > 0) await deleteMessages(messageIds);
    setSelectedIds(new Set());
    setIsActive(false);
  }, [deleteMessages, runs, selectedIds]);

  return {
    isActive,
    selectedIds,
    selectableCount: selectableIds.length,
    allSelected,
    toggleMode,
    toggleRun,
    toggleAll,
    deleteSelected,
  };
}
