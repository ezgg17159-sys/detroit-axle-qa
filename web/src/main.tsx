import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

if (import.meta.env.PROD) {
  const noop = () => undefined;
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.warn = noop;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
