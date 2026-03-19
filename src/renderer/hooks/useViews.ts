import { useCallback, useMemo, useState } from "react";

import type { WindowSizePreset } from "@/shared/window-controls";

export const VIEW_OPTIONS = {
  controls: "controls",
  options: "options",
} as const;

export type ViewOption = (typeof VIEW_OPTIONS)[keyof typeof VIEW_OPTIONS];

export type WindowSizePresetOption = {
  readonly preset: WindowSizePreset;
  readonly label: string;
  readonly description: string;
};

export function useViews() {
  const [activeView, setActiveView] = useState<ViewOption>(VIEW_OPTIONS.controls);

  const handleSetActiveView = useCallback((newView: ViewOption) => {
    setActiveView(newView);
  }, []);

  const resizePresetOptions = useMemo<readonly WindowSizePresetOption[]>(
    () => [
      {
        preset: "half",
        label: "1/2 Screen",
        description: "900 x 700",
      },
      {
        preset: "three-quarters",
        label: "3/4 Screen",
        description: "75% of display",
      },
      {
        preset: "full",
        label: "Full",
        description: "Display size minus 100px",
      },
    ],
    [],
  );

  return {
    activeView,
    handleSetActiveView,
    resizePresetOptions,
  };
}