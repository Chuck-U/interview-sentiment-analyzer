
import { IconToggle } from "@/components/molecules/IconToggle";

import type { WindowBoundsSnapshot, WindowSizePreset } from "@/shared/window-controls";
import { RiExpandHorizontalLine, RiContractLeftRightFill } from "@remixicon/react";
import { CSSProperties, useCallback } from "react";

type WindowResizePresetOption = {
  readonly preset: WindowSizePreset;
  readonly label: string;
};

type WindowResizeControlProps = {
  readonly windowBounds: WindowBoundsSnapshot | null;
  readonly presetOptions: readonly WindowResizePresetOption[];
  readonly onSelectPreset: (
    preset: WindowSizePreset,
  ) => Promise<WindowBoundsSnapshot>;
};

export function WindowResizeControl({
  windowBounds,
  presetOptions,
  onSelectPreset,
}: WindowResizeControlProps) {

  const isExpanded = Boolean(windowBounds?.width && windowBounds.width > 700);


  const onToggle = () => {
    if (isExpanded) {
      console.debug("[window-resize-control] toggle to collapsed");
      return onSelectPreset("50%");
    } else {
      console.debug("[window-resize-control] toggle to expanded");
      return onSelectPreset("90%");
    }
  }
  return (
    <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
      <IconToggle
        pressed={isExpanded}
        ariaLabel="Toggle recording keyboard shortcut"
        onPressedChange={() => void onToggle()}
        IconActive={RiContractLeftRightFill}
        IconInactive={RiExpandHorizontalLine}
        className="bg-transparent data-[state=on]:hover:bg-accent/30 data-[state=on]:hover:ring-2 data-[state=on]:active:bg-accent/50"
      />
    </div>
  )
}
