import type { CSSProperties } from "react";

import { RiCheckboxBlankCircleLine, RiCheckboxCircleLine } from "@remixicon/react";


import { IconToggle } from "@components/molecules/IconToggle";

type ShortcutSettingsCardProps = {
  readonly shortcutLabel: string;
  readonly isShortcutEnabled: boolean;
  readonly isBusy: boolean;
  readonly onSetShortcutEnabled: (enabled: boolean) => void;
};

export function ShortcutSettingsCard({
  shortcutLabel,
  isShortcutEnabled,
  isBusy,
  onSetShortcutEnabled,
}: ShortcutSettingsCardProps) {
  return (

    <div className="flex flex-col items-start justify-between gap-3 rounded-md border p-3">
      <p className="text-sm">Keyboard Shortcuts</p>
      <div className="flex flex-col gap-1">
        <p className="text-sm">Recording toggle</p>
        <p className="text-sm text-muted-foreground">
          Trigger: {shortcutLabel}
        </p>
      </div>
      <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        <IconToggle
          pressed={isShortcutEnabled}
          ariaLabel="Toggle recording keyboard shortcut"
          disabled={isBusy}
          onPressedChange={onSetShortcutEnabled}
          IconActive={RiCheckboxCircleLine}
          IconInactive={RiCheckboxBlankCircleLine}
        />
      </div>
    </div>

  );
}
