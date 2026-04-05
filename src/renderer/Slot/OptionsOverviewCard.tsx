
import type { ShortcutSettingsCardProps } from "./ShortcutSettingsCard";
import { ShortcutSettingsCard } from "./ShortcutSettingsCard";

export type OptionsOverviewCardProps = Pick<
  ShortcutSettingsCardProps,
  | "recordingShortcutLabel"
  | "recordingAccelerator"
  | "isRecordingShortcutEnabled"
  | "onSetRecordingShortcutEnabled"
  | "onSaveRecordingAccelerator"
  | "pingShortcutLabel"
  | "pingAccelerator"
  | "isPingShortcutEnabled"
  | "onSetPingShortcutEnabled"
  | "onSavePingAccelerator"
  | "isBusy"
>;

export function OptionsOverviewCard(props: OptionsOverviewCardProps) {
  return (
    <div>
      <ShortcutSettingsCard {...props} />
    </div>
  );
}
