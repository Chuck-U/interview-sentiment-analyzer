import { useCallback, useMemo } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  RESIZE_PRESET_OPTIONS,
  VIEW_OPTIONS,
  closeView,
  openView,
  setActiveView,
  toggleView,
  type CardWindowId,
  type ViewOption,
  type WindowSizePresetOption,
} from "../store/slices/viewsSlice";

export { VIEW_OPTIONS };
export type { ViewOption, WindowSizePresetOption, CardWindowId };

export function useViews() {
  const dispatch = useAppDispatch();
  const activeView = useAppSelector((state) => state.views.activeView);
  const openWindowIds = useAppSelector((state) => state.views.openWindowIds);

  const handleSetActiveView = useCallback(
    (newView: ViewOption) => {
      dispatch(setActiveView(newView));
    },
    [dispatch],
  );

  const handleOpenView = useCallback(
    (id: CardWindowId) => {
      dispatch(openView(id));
    },
    [dispatch],
  );

  const handleCloseView = useCallback(
    (id: CardWindowId) => {
      dispatch(closeView(id));
    },
    [dispatch],
  );

  const handleToggleView = useCallback(
    (id: CardWindowId) => {
      dispatch(toggleView(id));
    },
    [dispatch],
  );

  const resizePresetOptions = useMemo(
    () => RESIZE_PRESET_OPTIONS,
    [],
  );

  return {
    activeView,
    openWindowIds,
    handleSetActiveView,
    handleOpenView,
    handleCloseView,
    handleToggleView,
    resizePresetOptions,
  };
}
