import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/logger";

// Catch uncaught errors and unhandled promise rejections app-wide.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary pageName="App">
    <App />
  </ErrorBoundary>,
);
