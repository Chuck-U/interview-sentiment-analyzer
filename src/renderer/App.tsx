import React, { useEffect } from "react";
import ReactDom from "react-dom/client";
import { Provider } from "react-redux";

// import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Main from "./main";
import { useBorderPingFlash } from "./hooks/useBorderPingFlash";
import { useQuestionDetectionEvents } from "./hooks/useQuestionDetectionEvents";
import { loadCaptureOptions } from "./store/slices/captureOptionsSlice";
import { startModelInit } from "./store/slices/modelInitSlice";
import { useAppDispatch } from "./store/hooks";
import { store } from "./store/store";
import "./styles.css";

export function AppRoot() {
  const dispatch = useAppDispatch();
  useQuestionDetectionEvents();
  const borderPingFlashGen = useBorderPingFlash();

  useEffect(() => {
    void dispatch(loadCaptureOptions());
  }, [dispatch]);

  useEffect(() => {
    const handle = requestIdleCallback(() => {
      // add ui indicator for model init
      void dispatch(startModelInit());
    });
    return () => cancelIdleCallback(handle);
  }, [dispatch]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {borderPingFlashGen > 0 ? (
        <div
          key={borderPingFlashGen}
          className="border-ping-flash-layer pointer-events-none absolute inset-0 z-[100] box-border rounded-sm border-[3px] border-[#d9ff00] shadow-[0_0_26px_rgba(217,255,0,0.85)]"
          aria-hidden
        />
      ) : null}
      <Main />
    </div>
  );
}

ReactDom.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <Provider store={store}>
        <AppRoot />
        {/* <Toaster /> */}
      </Provider>
    </TooltipProvider>
  </React.StrictMode>,
);
