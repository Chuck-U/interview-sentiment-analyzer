import { useMemo } from "react";

import { AgentNavigationMenu } from "@/components/molecules/LauncherMenu";
import { formatElectronAcceleratorLabel } from "@/shared/shortcuts";
import { WINDOW_ROLES, WindowRole } from "@/shared/window-registry";
import { CardWindowMain } from "./CardWindowMain";
import { usePinnedWindowBehavior } from "./hooks/usePinnedWindowBehavior";
import { useRecordingSession } from "./hooks/useRecordingSession";
import { useShortcutsWindowEffects } from "./hooks/useShortcutsWindowEffects";
import { useViews } from "./hooks/useViews";
import { useWindowRegistrySync } from "./hooks/useWindowRegistrySync";
import { parseWindowRoleFromLocation } from "../lib/parseWindowRole";
import { useAppSelector } from "./store/hooks";
import { WindowPinControl } from "./window-controls/window-pin-control";

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

  const { handleSetActiveView, resizePresetOptions } = useViews();
  const openWindowIds = useAppSelector((state) => state.views.openWindowIds);
  const { dragRegionStyle, pinControlProps } = usePinnedWindowBehavior();


  const isRecording = currentSession?.status === "active";
  const isBusy = isStarting || isStopping;

  const platformLabel = useMemo(() => window.electronApp.platform, []);
  const visibilityShortcutLabel = useMemo(
    () => formatElectronAcceleratorLabel("CommandOrControl+Shift+V", platformLabel),
    [platformLabel]
  );
  return (
    <div className="flex h-full min-h-0 w-full flex-col justify-start bg-transparent" id="main-window">
      <nav
        className="z-[70] mx-2 inline-flex max-w-[calc(100vw-16px)] shrink-0 flex-col gap-2 bg-background/15 mt-4"
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
          // resizeControl={
          //   <WindowResizeControl
          //     windowBounds={windowBounds}
          //     presetOptions={resizePresetOptions}
          //     onSelectPreset={handleResizePreset}
          //   />
          // }
          openWindowIds={openWindowIds as Record<Partial<WindowRole>, boolean>}
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
            console.log('onQuestionBoxToggle');
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

      {/* <div className="relative bottom-0 h-full mb-1">
        <TranscriptionStreamPanel isRecording={isRecording} />
      </div> */}
    </div>
  );
}

function Main() {
  const role = parseWindowRoleFromLocation();
  if (role === WINDOW_ROLES.launcher) {
    return <LauncherMain />;
  }
  // @cursor we'll refactor this to have different window handlers and split this file.
  console.log('role', role)
  return <CardWindowMain layout={'options'} id={role as string} />;
}

export default Main;
