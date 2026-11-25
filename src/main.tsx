import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { installAuthFetch } from "./lib/authFetch";
import { initializeTheme } from "./lib/theme";
import "./styles.css";
import "./story.css";
import "./knowledge.css";
import "./radar.css";

initializeTheme();
installAuthFetch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
