import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { RiCheckboxBlankCircleLine, RiCheckboxCircleLine } from "@remixicon/react";

import { IconToggle } from "@components/molecules/IconToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ShortcutRowProps = {
  readonly title: string;
  readonly shortcutLabel: string;
  readonly accelerator: string;
  readonly isEnabled: boolean;
  readonly isBusy: boolean;
  readonly onSetEnabled: (enabled: boolean) => void;
  readonly onSaveAccelerator: (accelerator: string) => void;
  readonly enableAriaLabel: string;
  readonly applyLabel?: string;
};

function ShortcutRow({
  title,
  shortcutLabel,
  accelerator,
  isEnabled,
  isBusy,
  onSetEnabled,
  onSaveAccelerator,
  enableAriaLabel,
  applyLabel = "Apply",
}: ShortcutRowProps) {
  const [draft, setDraft] = useState(accelerator);

  useEffect(() => {
    setDraft(accelerator);
  }, [accelerator]);

  const trimmed = draft.trim();
  const canApply = trimmed.length > 0 && trimmed !== accelerator.trim();

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">
        Current: <span className="text-foreground">{shortcutLabel}</span>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          placeholder="CommandOrControl+Shift+…"
          disabled={isBusy}
          className="font-mono text-xs sm:max-w-md"
          aria-label={`${title} accelerator`}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isBusy || !canApply}
          onClick={() => {
            onSaveAccelerator(trimmed);
          }}
        >
          {applyLabel}
        </Button>
      </div>
      <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        <IconToggle
          pressed={isEnabled}
          ariaLabel={enableAriaLabel}
          disabled={isBusy}
          onPressedChange={onSetEnabled}
          IconActive={RiCheckboxCircleLine}
          IconInactive={RiCheckboxBlankCircleLine}
        />
      </div>
    </div>
  );
}

export type ShortcutSettingsCardProps = {
  readonly recordingShortcutLabel: string;
  readonly recordingAccelerator: string;
  readonly isRecordingShortcutEnabled: boolean;
  readonly onSetRecordingShortcutEnabled: (enabled: boolean) => void;
  readonly onSaveRecordingAccelerator: (accelerator: string) => void;

  readonly pingShortcutLabel: string;
  readonly pingAccelerator: string;
  readonly isPingShortcutEnabled: boolean;
  readonly onSetPingShortcutEnabled: (enabled: boolean) => void;
  readonly onSavePingAccelerator: (accelerator: string) => void;

  readonly isBusy: boolean;
};

export function ShortcutSettingsCard({
  recordingShortcutLabel,
  recordingAccelerator,
  isRecordingShortcutEnabled,
  onSetRecordingShortcutEnabled,
  onSaveRecordingAccelerator,
  pingShortcutLabel,
  pingAccelerator,
  isPingShortcutEnabled,
  onSetPingShortcutEnabled,
  onSavePingAccelerator,
  isBusy,
}: ShortcutSettingsCardProps) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-4 rounded-md border p-3">
      <p className="text-sm font-medium">Keyboard shortcuts</p>

      <ShortcutRow
        title="Recording toggle"
        shortcutLabel={recordingShortcutLabel}
        accelerator={recordingAccelerator}
        isEnabled={isRecordingShortcutEnabled}
        isBusy={isBusy}
        onSetEnabled={onSetRecordingShortcutEnabled}
        onSaveAccelerator={onSaveRecordingAccelerator}
        enableAriaLabel="Toggle recording keyboard shortcut"
      />
      <ShortcutRow
        title="Ping all windows (border flash)"
        shortcutLabel={pingShortcutLabel}
        accelerator={pingAccelerator}
        isEnabled={isPingShortcutEnabled}
        isBusy={isBusy}
        onSetEnabled={onSetPingShortcutEnabled}
        onSaveAccelerator={onSavePingAccelerator}
        enableAriaLabel="Toggle ping all windows keyboard shortcut"
      />
    </div>
  );
}
