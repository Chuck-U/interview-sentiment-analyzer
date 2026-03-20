import { useState, useCallback } from "react";



export const VIEW_OPTIONS = { controls: "controls", options: "options", analysis: "analysis" } as const;
export type ViewOption = (typeof VIEW_OPTIONS)[keyof typeof VIEW_OPTIONS];

export type ViewsContextType = {
    activeViews: ViewOption[];
    handleSetActiveViews: (view: ViewOption) => void;
};





export function useViews() {
    const [activeViews, setActiveViews] = useState<ViewOption[]>(['controls', 'options']);

    const handleSetActiveViews = useCallback((newView: ViewOption) => {
        const modifiedViews = activeViews.includes(newView) ? activeViews.filter(view => view !== newView) : [...activeViews, newView];
        setActiveViews(modifiedViews);
    }, [activeViews]);

    return { activeViews, handleSetActiveViews };
}