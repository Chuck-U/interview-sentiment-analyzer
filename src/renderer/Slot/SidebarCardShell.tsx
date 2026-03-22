import type { ComponentType, CSSProperties, ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
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
          "--sidebar-width": "20%",
          WebkitAppRegion: "no-drag",
        } as CSSProperties
      }
    >
      <Sidebar
        collapsible="none"
        className="min-h-0 border-r border-sidebar-border/20 bg-sidebar/95"
        style={noDragStyle}
      >
        <SidebarContent
          className="min-h-0 flex-1 overflow-y-auto from-[#fff6c0f4]/60 bg-[#ffe85b70] to-[#d4ba11ff]/40 bg-gradient-to-t"
          style={noDragStyle}
        >
          <SidebarGroup>
            <SidebarGroupLabel className="border-b pb-1 border-b-[#">Sections</SidebarGroupLabel>
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
        className="flex min-h-0 flex-1 overflow-hidden backface-visible p-0"
        style={noDragStyle}
      >
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          style={noDragStyle}
        >
          {activeContent}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
