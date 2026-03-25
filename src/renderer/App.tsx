import React, { useEffect } from "react";
import ReactDom from "react-dom/client";
import { Provider } from "react-redux";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Main from "./main";
import { loadCaptureOptions } from "./store/slices/captureOptionsSlice";
import { startModelInit } from "./store/slices/modelInitSlice";
import { useAppDispatch } from "./store/hooks";
import { store } from "./store/store";
import "./styles.css";

export function AppRoot() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(loadCaptureOptions());
  }, [dispatch]);

  useEffect(() => {
    const handle = requestIdleCallback(() => {
      void dispatch(startModelInit());
    });
    return () => cancelIdleCallback(handle);
  }, [dispatch]);

  return <Main />;
}

ReactDom.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <Provider store={store}>
        <AppRoot />
        <Toaster />
      </Provider>
    </TooltipProvider>
  </React.StrictMode>,
);