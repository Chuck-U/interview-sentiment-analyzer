import React from "react";
import ReactDom from "react-dom/client";
import { Provider } from "react-redux";

import { Toaster } from "@/components/ui/sonner";

import Main from "./main";
import { store } from "./store/store";
import "./styles.css";

ReactDom.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <Main />
      <Toaster />
    </Provider>
  </React.StrictMode>,
);