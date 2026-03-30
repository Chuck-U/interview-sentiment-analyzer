
import { cn } from "@/lib/utils";
import {
    RiArrowDownSLine,
    RiCloseLine,
    RiEyeLine,
    RiSettings3Line,
    RiRecordCircleLine,
    RiStopCircleLine,
    RiDiscussLine,
} from "@remixicon/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RecordingTimer } from "../molecules/Timer";
import { WindowRole } from "@/shared/window-registry";


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
    readonly openWindowIds?: Record<WindowRole, boolean>;
    readonly onQuestionBoxToggle?: () => void;
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
    openWindowIds,
    onQuestionBoxToggle,
}: AgentNavigationMenuProps) {
    const RecordingIcon = isRecording ? RiStopCircleLine : RiRecordCircleLine;
    const isQuestionBoxOpen = openWindowIds?.['question-box'] ?? false;
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
            <div className="block justify-end">

            </div>
            <div className="flex items-center gap-2">
                <button className={cn("rounded-none p-1 group/question-box text-muted-foreground  hover:border-red-400/70 transition-colors", isQuestionBoxOpen ? "text-red-500/50" : "text-muted-foreground")}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    onClick={() => {
                        onQuestionBoxToggle?.();
                    }}>
                    <RiDiscussLine className={cn("size-8 group-hover/question-box:text-red-500/50 group-active/question-box:text-red-500/50 transition-colors duration-200 ease-in-out group-hover/question-box:border-bg-red-300")} />
                </button>
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
