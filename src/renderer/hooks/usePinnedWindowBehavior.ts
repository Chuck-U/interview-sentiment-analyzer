import { useCallback, useMemo } from "react";
import type { CSSProperties } from "react";

import { useAppSelector } from "../store/hooks";

const DRAG_REGION_STYLE = {
  WebkitAppRegion: "drag",
} as CSSProperties;

const NO_DRAG_REGION_STYLE = {
  WebkitAppRegion: "no-drag",
} as CSSProperties;

export function usePinnedWindowBehavior() {
  const isPinned = useAppSelector((state) => state.shortcutsWindow.isPinned);

  const dragRegionStyle = useMemo<CSSProperties>(() => {
    return isPinned ? NO_DRAG_REGION_STYLE : DRAG_REGION_STYLE;
  }, [isPinned]);

  const togglePinned = useCallback(async (nextValue: boolean) => {
    return window.electronApp.windowControls.setPinned({
      pinned: nextValue,
    });
  }, []);

  return {
    isPinned,
    isDragEnabled: !isPinned,
    dragRegionStyle,
    noDragRegionStyle: NO_DRAG_REGION_STYLE,
    pinControlProps: {
      isPinned,
      onToggle: togglePinned,
    },
  };
}
