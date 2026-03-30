import type { ComponentType, CSSProperties, ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarGroupLabel,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SidebarCardSection<TSectionId extends string> = {
  readonly id: TSectionId;
  readonly label: string;
  readonly description?: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly content: ReactNode;
};

type SidebarCardShellProps<TSectionId extends string> = {

  readonly sections: readonly SidebarCardSection<TSectionId>[];
  readonly activeSection: TSectionId;
  readonly onActiveSectionChange: (section: TSectionId) => void;
  readonly className?: string;
  readonly onOpenRecordingsFolder: () => void;
};

export function SidebarCardShell<TSectionId extends string>({
  sections,
  activeSection,
  onActiveSectionChange,
  className,
}: SidebarCardShellProps<TSectionId>) {
  const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const activeContent =
    sections.find((section) => section.id === activeSection)?.content ??
    sections[0]?.content ??
    null;

  return (
    <SidebarProvider
      defaultOpen
      className={cn("h-full !min-h-0 w-full overflow-hidden", className)}
      style={
        {
          "--sidebar-width": "30%",
          WebkitAppRegion: "no-drag",
        } as CSSProperties
      }
    >
      <Sidebar
        collapsible="none"
        className="min-h-0"
        style={noDragStyle}
      >
        <SidebarContent
          className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-yellow-a6/30 to-transparent"
          style={noDragStyle}
        >
          <SidebarGroup>
            <SidebarGroupLabel className="pb-1 ">Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sections.map((section) => {
                  const Icon = section.icon;

                  return (
                    <SidebarMenuItem key={section.id}>
                      <SidebarMenuButton
                        type="button"
                        isActive={section.id === activeSection}
                        tooltip={section.label}
                        onClick={() => onActiveSectionChange(section.id)}
                      >
                        <Icon />
                        <span>{section.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset
        className="flex min-h-0 flex-1 p-0  overflow-hidden"
        style={noDragStyle}
      >
        <div
          className="flex min-h-0 flex-1 flex-col from-yellow-a6/30 via-yellow-a6/20 to-transparent bg-gradient-to-br mt-4"
          style={noDragStyle}
        >
          {activeContent}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
