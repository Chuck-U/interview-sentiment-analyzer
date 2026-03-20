import { useEffect } from "react";

import { useAppDispatch } from "../store/hooks";
import { syncOpenWindowIds } from "../store/slices/viewsSlice";

export function useWindowRegistrySync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isActive = true;

    void window.electronApp.windowRegistry.getOpenState().then((state) => {
      if (isActive) {
        dispatch(syncOpenWindowIds(state.openIds));
      }
    });

    const unsubscribe = window.electronApp.windowRegistry.onOpenStateChanged(
      (state) => {
        dispatch(syncOpenWindowIds(state.openIds));
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [dispatch]);
}
