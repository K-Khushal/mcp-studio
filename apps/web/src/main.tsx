import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./fonts.css";
import App from "./App";
import { LaunchGate } from "./components/shell/launch-gate";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <LaunchGate>
      <App />
    </LaunchGate>
  </StrictMode>
);
