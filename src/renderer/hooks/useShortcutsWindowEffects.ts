import { useEffect } from "react";

import {
  DEFAULT_SHORTCUT_ID_PING_WINDOWS,
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
} from "@/shared/shortcuts";

import { useAppDispatch } from "../store/hooks";
import { setFeedbackMessage } from "../store/slices/sessionRecordingSlice";
import {
  setAlwaysOnTop,
  setPinned,
  setPingShortcutAccelerator,
  setPingShortcutEnabled,
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

        const recordingEntry =
          config.shortcuts[DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE];
        const pingEntry = config.shortcuts[DEFAULT_SHORTCUT_ID_PING_WINDOWS];

        if (recordingEntry) {
          dispatch(setShortcutEnabled(recordingEntry.enabled));
          dispatch(setRecordingShortcutAccelerator(recordingEntry.accelerator));
        }

        if (pingEntry) {
          dispatch(setPingShortcutEnabled(pingEntry.enabled));
          dispatch(setPingShortcutAccelerator(pingEntry.accelerator));
        }
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

  useEffect(() => {
    let isSubscribed = true;

    void window.electronApp.windowControls
      .getAlwaysOnTop()
      .then((alwaysOnTop) => {
        if (isSubscribed) {
          dispatch(setAlwaysOnTop(alwaysOnTop));
        }
      })
      .catch((error: unknown) => {
        if (isSubscribed) {
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to sync pinned window state.",
            ),
          );
        }
      });

    const unsubscribe =
      window.electronApp.windowControls.onAlwaysOnTopChanged((alwaysOnTop) => {
        dispatch(setAlwaysOnTop(alwaysOnTop));
      });

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [dispatch]);

  useEffect(() => {
    let isSubscribed = true;

    void window.electronApp.windowControls
      .getPinned()
      .then((pinned) => {
        if (isSubscribed) {
          dispatch(setPinned(pinned));
        }
      })
      .catch((error: unknown) => {
        if (isSubscribed) {
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to sync pinned window state.",
            ),
          );
        }
      });

    const unsubscribe = window.electronApp.windowControls.onPinnedChanged(
      (pinned) => {
        dispatch(setPinned(pinned));
      },
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [dispatch]);
}
