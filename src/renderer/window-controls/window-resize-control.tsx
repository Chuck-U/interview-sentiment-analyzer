import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WindowBoundsSnapshot, WindowSizePreset } from "@/shared/window-controls";
import { RiExpandDiagonalLine } from "@remixicon/react";

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
  const currentSizeLabel = windowBounds
    ? `${windowBounds.width}px x ${windowBounds.height}px`
    : "Syncing window size";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Resize window"
          title={`Resize window. Current: ${currentSizeLabel}`}
          className="bg-transparent hover:bg-yellow-contrast"
        >
          <RiExpandDiagonalLine data-icon="inline-start hover:text-yellow-8" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="min-w-44"
      >
        <DropdownMenuLabel className="pt-0 text-[11px]">
          Current: {currentSizeLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {presetOptions.map((option) => (
            <DropdownMenuItem
              key={option.preset}
              onSelect={() => {
                console.debug("[window-resize-control] preset selected", {
                  preset: option.preset,
                  label: option.label,
                  currentSize: currentSizeLabel,
                });
                void onSelectPreset(option.preset);
              }}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span>{option.label}</span>
              </div>
              <DropdownMenuShortcut>{option.preset}</DropdownMenuShortcut>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
