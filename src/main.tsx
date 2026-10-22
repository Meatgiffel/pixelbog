import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/layout.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./state/settings";
import { App } from "./App";
import { restoreSession } from "./state/app";

restoreSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
