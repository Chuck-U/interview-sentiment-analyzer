import * as React from "react";
import { cva } from "class-variance-authority";
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import {
  RiArrowDownSLine,
  RiCloseLine,
  RiEyeLine,
  RiSettings3Line,
  RiRecordCircleLine,
  RiStopCircleLine,
} from "@remixicon/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { RecordingTimer } from "../molecules/Timer";

function NavigationMenu({
  className,
  children,
  viewport = true,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean;
}) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
      {viewport && <NavigationMenuViewport />}
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-0",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

const navigationMenuTriggerStyle = cva(
  "group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-none bg-background px-2.5 py-1.5 text-xs font-medium transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-muted/50 data-popup-open:hover:bg-muted data-open:bg-muted/50 data-open:hover:bg-muted data-open:focus:bg-muted",
);

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}{" "}
      <RiArrowDownSLine
        className="relative top-px ml-1 size-3 transition duration-300 group-data-popup-open/navigation-menu-trigger:rotate-180 group-data-open/navigation-menu-trigger:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "top-0 left-0 w-full p-1 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-none group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:shadow group-data-[viewport=false]/navigation-menu:ring-1 group-data-[viewport=false]/navigation-menu:ring-foreground/10 group-data-[viewport=false]/navigation-menu:duration-300 data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none md:absolute md:w-auto group-data-[viewport=false]/navigation-menu:data-open:animate-in group-data-[viewport=false]/navigation-menu:data-open:fade-in-0 group-data-[viewport=false]/navigation-menu:data-open:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-closed:animate-out group-data-[viewport=false]/navigation-menu:data-closed:fade-out-0 group-data-[viewport=false]/navigation-menu:data-closed:zoom-out-95",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div
      className={cn(
        "absolute top-full left-0 isolate z-50 flex justify-center",
      )}
    >
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "origin-top-center relative mt-1.5 h-(--radix-navigation-menu-viewport-height) w-full overflow-hidden rounded-none bg-popover text-popover-foreground shadow ring-1 ring-foreground/10 duration-100 md:w-(--radix-navigation-menu-viewport-width) data-open:animate-in data-open:zoom-in-90 data-closed:animate-out data-closed:zoom-out-90",
          className
        )}
        {...props}
      />
    </div>
  );
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "flex items-center gap-2 rounded-none p-2 text-xs transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-1 in-data-[slot=navigation-menu-content]:rounded-none data-active:bg-muted/50 data-active:hover:bg-muted data-active:focus:bg-muted [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "top-full z-1 flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:animate-in data-[state=visible]:fade-in",
        className,
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-none bg-border shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
};

type AgentNavigationMenuProps = {
  readonly isRecording?: boolean;
  readonly isBusy?: boolean;
  readonly onRecordingToggle?: (start: boolean) => void;
  readonly onClose?: () => void;
  readonly onToggleVisibility?: () => void;
  readonly visibilityShortcut?: string;
  readonly pinControl?: React.ReactNode;
  readonly resizeControl?: React.ReactNode;
  readonly onWorkspaceToggle?: () => void;
  readonly isWorkspaceOpen?: boolean;
  readonly className?: string;
  readonly showOutline?: boolean;
  readonly recordingStartTime?: number | null;
};

function AgentNavigationMenu({
  isRecording,
  isBusy,
  onRecordingToggle,
  onClose,
  onToggleVisibility,
  visibilityShortcut,
  pinControl,
  resizeControl,
  onWorkspaceToggle,
  isWorkspaceOpen,
  className,
  showOutline = false,
  recordingStartTime,
}: AgentNavigationMenuProps) {
  const RecordingIcon = isRecording ? RiStopCircleLine : RiRecordCircleLine;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-sm border border-border/50 bg-transparent p-2",
        className,
        showOutline ? "outline-2 inset-0 outline-green-500/50 outline-dashed" : "",
      )}
      data-slot="agent-navigation-menu"
    >
      <div className="flex items-center gap-2">
        {pinControl}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onToggleVisibility?.()}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              className="rounded-none p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Toggle visibility"
            >
              <RiEyeLine className="size-8 rounded-full p-1 transition-all duration-200 ease-in-out" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" sideOffset={8} className="flex max-w-none items-center gap-2 p-2 bg-muted-background text-white">
            <span>Toggle Visibility</span>
            {visibilityShortcut ? (
              <kbd
                data-slot="kbd"
                className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-none border border-background/20 bg-background/15 px-1.5 font-mono text-[10px] font-medium text-background"
              >
                {visibilityShortcut}
              </kbd>
            ) : (
              <kbd
                data-slot="kbd"
                className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-none border border-background/20 bg-background/15 p-2 font-mono text-[10px] font-medium text-background"
              >
                Ctrl+Shift+V
              </kbd>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center justify-center px-10">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onRecordingToggle?.(!isRecording)}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className={cn(
            "transition-colors disabled:opacity-50 disabled:pointer-events-none",
            isRecording
              ? "text-destructive"
              : "text-accent-foreground",
            'group'
          )}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          <RecordingIcon className={cn("size-8 text-red-500/50 group-active:animate-pulse duration-400", isRecording ? 'animate-pulse duration-500 transition-colors from-red-500/50 to-red-500/10' : 'animate-none duration-0 ease-out')} />
        </button>
        {recordingStartTime &&
          (<span className="w-full">

            <RecordingTimer recordingStartTime={recordingStartTime} isRecording={isRecording ?? false} />
          </span>
          )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onWorkspaceToggle?.()}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className={cn(
            "rounded-none p-1 transition-colors hover:text-yellow-indicator",
            isWorkspaceOpen ? "text-yellow-indicator" : "text-muted-foreground"
          )}
          aria-label="Toggle workspace"
        >
          <RiSettings3Line className="size-8 rounded-full p-1 transition-all duration-200 ease-in-out" />
        </button>

        {resizeControl}

        <button
          type="button"
          onClick={() => onClose?.()}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className="rounded-none p-1 text-muted-foreground hover:text-red-500/50 hover:border-red-400/70 transition-colors"
          aria-label="Close app"
        >
          <RiCloseLine className="size-8 rounded-full p-1 hover:border-2 hover:border-red-400/70 transition-all duration-200 ease-in-out" />
        </button>
      </div>
    </div>
  );
}

export { AgentNavigationMenu };
