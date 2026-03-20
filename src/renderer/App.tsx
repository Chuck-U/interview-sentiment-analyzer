import React from "react";
import ReactDom from "react-dom/client";
import "./styles.css";
import Main from "./main";
ReactDom.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <head>
      <link rel="stylesheet" href="/src/renderer/styles.css" />
    </head>
      <Main />
  </React.StrictMode>,
);