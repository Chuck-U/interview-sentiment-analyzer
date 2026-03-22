import { useMemo, useState } from "react";

import {
  RiFlaskLine,
  RiRecordCircleFill,
  RiSettings3Line,
} from "@remixicon/react";

import { RecordingSandboxCard } from "@/renderer/recording/recording-sandbox-card";

import type { OptionsCardLayout, OptionsProps } from "./Options";
import { AgentControls } from "./AgentControls";
import { OptionsOverviewCard } from "./OptionsOverviewCard";
import { SidebarCardShell } from "./SidebarCardShell";

type WorkspaceSectionId = OptionsCardLayout;

type OptionsWorkspaceProps = Omit<OptionsProps, "layout"> & {
  readonly initialSection?: WorkspaceSectionId;
};

export function OptionsWorkspace({
  initialSection = "options",
  ...props
}: OptionsWorkspaceProps) {
  const [showPermissions, setShowPermissions] = useState(false);
  const [activeSection, setActiveSection] =
    useState<WorkspaceSectionId>(initialSection);

  const sections = useMemo(
    () => [
      {
        id: "options",
        label: "Options",
        icon: RiSettings3Line,
        content: (
          <OptionsOverviewCard
            {...props}
            showPermissions={showPermissions}
            setShowPermissions={setShowPermissions}
          />
        ),
      },
      {
        id: "controls",
        label: "Controls",
        icon: RiRecordCircleFill,
        content: (
          <AgentControls
            {...props}
            showQuitButton={false}
            showStatusBadges={false}
          />
        ),
      },
      {
        id: "sandbox",
        label: "Sandbox",
        icon: RiFlaskLine,
        content: <RecordingSandboxCard />,
      },
    ] as const,
    [props, setShowPermissions, showPermissions],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <SidebarCardShell
        sections={sections}
        activeSection={activeSection}
        onActiveSectionChange={setActiveSection}
      />
    </div>
  );
}
