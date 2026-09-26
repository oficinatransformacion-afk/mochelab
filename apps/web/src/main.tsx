import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { GlobalNavigation } from "./navigation/GlobalNavigation";
import { hasDemoSession } from "./access/demoSession";
import { CapabilitiesProvider } from "./access/CapabilitiesContext";

const sessionActive = hasDemoSession();
const isDevelopmentEnvironment = (import.meta.env.VITE_APP_ENV ?? "development") === "development";
const environmentLabel = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "Entorno local"
  : "Entorno de pruebas";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CapabilitiesProvider>
      {isDevelopmentEnvironment && <div className="environment-badge" role="status">{environmentLabel}</div>}
      {sessionActive && window.location.pathname !== "/login" && <GlobalNavigation />}
      <App />
    </CapabilitiesProvider>
  </StrictMode>,
);
