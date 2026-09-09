import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { GlobalNavigation } from "./navigation/GlobalNavigation";
import { hasDemoSession } from "./access/demoSession";

const sessionActive = hasDemoSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {sessionActive && window.location.pathname !== "/login" && <GlobalNavigation />}
    <App />
  </StrictMode>,
);
