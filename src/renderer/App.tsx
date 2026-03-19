import React from "react";
import ReactDom from "react-dom/client";
import "./styles.css";
import Main from "./main";
ReactDom.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Main />
  </React.StrictMode>,
);