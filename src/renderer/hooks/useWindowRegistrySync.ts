import { useEffect } from "react";

import { WINDOW_ROLES, type CardWindowsOpenState } from "@/shared/window-registry";
import { useAppDispatch } from "../store/hooks";
import { syncOpenWindowIds, type CardWindowId } from "../store/slices/viewsSlice";

function mergeRegistryOpenState(
  openIds: CardWindowsOpenState["openIds"],
): Record<CardWindowId, boolean> {
  return {
    [WINDOW_ROLES.launcher]: false,
    ...openIds,
  };
}

export function useWindowRegistrySync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isActive = true;

    void window.electronApp.windowRegistry.getOpenState().then((state) => {
      if (isActive) {
        dispatch(syncOpenWindowIds(mergeRegistryOpenState(state.openIds)));
      }
    });

    const unsubscribe = window.electronApp.windowRegistry.onOpenStateChanged(
      (state) => {
        dispatch(syncOpenWindowIds(mergeRegistryOpenState(state.openIds)));
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [dispatch]);
}
