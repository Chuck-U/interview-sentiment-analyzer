import { useEffect } from "react";

import { DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE } from "@/shared/shortcuts";

import { useAppDispatch } from "../store/hooks";
import { setFeedbackMessage } from "../store/slices/sessionRecordingSlice";
import {
  setRecordingShortcutAccelerator,
  setShortcutEnabled,
  setWindowBounds,
} from "../store/slices/shortcutsWindowSlice";

export function useShortcutsWindowEffects() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isSubscribed = true;

    void window.electronApp.shortcuts
      .getConfig()
      .then((config) => {
        if (!isSubscribed) {
          return;
        }

        const entry =
          config.shortcuts[DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE];

        if (!entry) {
          return;
        }

        dispatch(setShortcutEnabled(entry.enabled));
        dispatch(setRecordingShortcutAccelerator(entry.accelerator));
      })
      .catch((error: unknown) => {
        if (!isSubscribed) {
          return;
        }

        dispatch(
          setFeedbackMessage(
            error instanceof Error ? error.message : "Unable to load shortcuts.",
          ),
        );
      });

    return () => {
      isSubscribed = false;
    };
  }, [dispatch]);

  useEffect(() => {
    let isSubscribed = true;

    void window.electronApp.windowControls
      .getWindowBounds()
      .then((bounds) => {
        if (isSubscribed) {
          dispatch(setWindowBounds(bounds));
        }
      })
      .catch((error: unknown) => {
        if (isSubscribed) {
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to sync overlay window size.",
            ),
          );
        }
      });

    const unsubscribe =
      window.electronApp.windowControls.onWindowBoundsChanged((bounds) => {
        dispatch(setWindowBounds(bounds));
      });

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [dispatch]);
}
