import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { GlobalNavigation } from "./navigation/GlobalNavigation";
import { hasDemoSession } from "./access/demoSession";

const sessionActive = hasDemoSession();
const isDevelopmentEnvironment = (import.meta.env.VITE_APP_ENV ?? "development") === "development";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isDevelopmentEnvironment && <div className="environment-badge" role="status">Entorno de pruebas</div>}
    {sessionActive && window.location.pathname !== "/login" && <GlobalNavigation />}
    <App />
  </StrictMode>,
);
