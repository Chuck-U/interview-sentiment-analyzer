
import type { OptionsProps } from "./Options";
import { ShortcutSettingsCard } from "./ShortcutSettingsCard";

// type OptionsOverviewCardProps = Pick<
//   OptionsProps,
//   | "statusLabel"
//   | "statusVariant"
//   | "platformLabel"
//   | "windowSizeLabel"
//   | "windowBoundsLabel"
//   | "shortcutLabel"
//   | "isShortcutEnabled"
//   | "onSetShortcutEnabled"
//   | "isBusy"
// >;

interface OptionsOverviewCardProps {
  shortcutLabel: string;
  isShortcutEnabled: boolean;
  onSetShortcutEnabled: (enabled: boolean) => void;
  isBusy: boolean;
}

export function OptionsOverviewCard({
  shortcutLabel,
  isShortcutEnabled,
  onSetShortcutEnabled,
  isBusy,
}: OptionsOverviewCardProps) {
  return (
    <div>
      <ShortcutSettingsCard
        shortcutLabel={shortcutLabel}
        isShortcutEnabled={isShortcutEnabled}
        isBusy={isBusy}
        onSetShortcutEnabled={onSetShortcutEnabled}
      />
    </div>
  );
}
