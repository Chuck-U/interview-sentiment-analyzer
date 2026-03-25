
import type { OptionsProps } from "./Options";
import { ShortcutSettingsCard } from "./ShortcutSettingsCard";

type OptionsOverviewCardProps = Pick<
  OptionsProps,
  | "statusLabel"
  | "statusVariant"
  | "platformLabel"
  | "windowSizeLabel"
  | "windowBoundsLabel"
  | "shortcutLabel"
  | "isShortcutEnabled"
  | "onSetShortcutEnabled"
  | "isBusy"
>;

export function OptionsOverviewCard({
  shortcutLabel,
  isShortcutEnabled,
  onSetShortcutEnabled,
  isBusy,
}: OptionsOverviewCardProps) {
  return (

    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <ShortcutSettingsCard
        shortcutLabel={shortcutLabel}
        isShortcutEnabled={isShortcutEnabled}
        isBusy={isBusy}
        onSetShortcutEnabled={onSetShortcutEnabled}
      />
    </div>
  );
}
