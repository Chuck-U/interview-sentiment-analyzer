import type { ComponentType, CSSProperties, ReactNode } from "react";

import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const activeContent =
    sections.find((section) => section.id === activeSection)?.content ??
    sections[0]?.content ??
    null;

  return (
    <SidebarProvider
      defaultOpen
      className={cn("h-full !min-h-0 w-full", className)}
      style={
        {
          "--sidebar-width": "13.5rem",
        } as CSSProperties
      }
    >
      <Sidebar
        collapsible="none"
        className="border-r border-sidebar-border/20 bg-sidebar/95"
      >

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Sections</SidebarGroupLabel>
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
      <SidebarInset className="flex min-h-0 flex-1 bg-transparent p-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {activeContent}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
