import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/logger";
import { initTheme } from "./lib/theme";
import { initPwa } from "./lib/pwa";

// Catch uncaught errors and unhandled promise rejections app-wide.
installGlobalErrorHandlers();
// Apply the saved appearance (theme + accent) before first paint.
initTheme();
// Register the service worker + capture the install prompt.
initPwa();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary pageName="App">
    <App />
  </ErrorBoundary>,
);
