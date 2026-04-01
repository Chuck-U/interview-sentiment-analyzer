import { useMemo } from "react";

import { AgentNavigationMenu } from "@/components/molecules/LauncherMenu";
import {
  WINDOW_ROLES,
  type CardWindowRole,
  type WindowRole,
} from "@/shared/window-registry";
import { formatElectronAcceleratorLabel } from "@/shared/shortcuts";
import { CardWindowMain } from "./CardWindowMain";
import { usePinnedWindowBehavior } from "./hooks/usePinnedWindowBehavior";
import { useRecordingSession } from "./hooks/useRecordingSession";
import { useShortcutsWindowEffects } from "./hooks/useShortcutsWindowEffects";
import { useViews } from "./hooks/useViews";
import { useWindowRegistrySync } from "./hooks/useWindowRegistrySync";
import { useAppSelector } from "./store/hooks";
import { WindowPinControl } from "./window-controls/window-pin-control";
import { parseWindowRoleFromLocation } from "../lib/parseWindowRole";
import { cn } from "@/lib/utils";
function LauncherMain() {
  useShortcutsWindowEffects();
  useWindowRegistrySync();
  const { handleToggleRecording, handleCloseApplication } = useRecordingSession();
  const currentSession = useAppSelector(
    (state) => state.sessionRecording.currentSession,
  );
  const isStarting = useAppSelector(
    (state) => state.sessionRecording.isStarting,
  );
  const isStopping = useAppSelector(
    (state) => state.sessionRecording.isStopping,
  );
  const { handleSetActiveView } = useViews();
  const openWindowIds = useAppSelector((state) => state.views.openWindowIds);
  const { dragRegionStyle, pinControlProps } = usePinnedWindowBehavior();
  const isPinned = useMemo(() => pinControlProps.isPinned, [pinControlProps.isPinned]);
  const isRecording = currentSession?.status === "active";
  const isBusy = isStarting || isStopping;
  const platformLabel = useMemo(() => window.electronApp.platform, []);
  const visibilityShortcutLabel = useMemo(
    () =>
      formatElectronAcceleratorLabel(
        "CommandOrControl+Shift+V",
        platformLabel,
      ),
    [platformLabel],
  );

  return (
    <div
      className={cn("flex h-full min-h-0 w-full flex-col justify-start bg-transparent",
      )}
      id="main-window"
    >
      <nav
        className={cn("z-[70] mx-2 inline-flex max-w-[calc(100vw-16px)] shrink-0 flex-col gap-2",
          isPinned ? `animate-ping/3 transition-all   duration-100 border border-primary/50 rounded-md` : "bg-transparent"
        )}
        style={dragRegionStyle}
      >
        <AgentNavigationMenu
          isRecording={isRecording}
          isBusy={isBusy}
          onRecordingToggle={(start) => {
            void handleToggleRecording(start);
          }}
          onToggleVisibility={() => {
            void window.electronApp.appControls.toggleVisibility();
          }}
          visibilityShortcut={visibilityShortcutLabel}
          pinControl={<WindowPinControl {...pinControlProps} />}
          openWindowIds={openWindowIds as Record<WindowRole, boolean>}
          isWorkspaceOpen={openWindowIds.options}
          onWorkspaceToggle={() => {
            handleSetActiveView(WINDOW_ROLES.options);
            if (openWindowIds.options) {
              void window.electronApp.windowRegistry.closeWindow(
                WINDOW_ROLES.options,
              );
            } else {
              void window.electronApp.windowRegistry.openWindow(
                WINDOW_ROLES.options,
              );
            }
          }}
          onQuestionBoxToggle={() => {
            handleSetActiveView(WINDOW_ROLES.questionBox);
            if (openWindowIds[WINDOW_ROLES.questionBox]) {
              void window.electronApp.windowRegistry.closeWindow(
                WINDOW_ROLES.questionBox,
              );
            } else {
              void window.electronApp.windowRegistry.openWindow(
                WINDOW_ROLES.questionBox,
              );
            }
          }}
          className="w-auto"
          onClose={() => {
            void handleCloseApplication();
          }}
        />
      </nav>
    </div>
  );
}

function Main() {
  const role = parseWindowRoleFromLocation();

  if (role === WINDOW_ROLES.launcher) {
    return <LauncherMain />;
  }

  return <CardWindowMain role={role as CardWindowRole} />;
}

export default Main;
