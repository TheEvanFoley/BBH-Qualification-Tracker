import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return {
      status: "unsupported",
      message: "This browser does not support installable app features.",
    };
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return {
      status: "ready",
      message: "Home-screen install is ready on supported devices.",
    };
  } catch (error) {
    return {
      status: "error",
      message: `Service worker setup failed: ${error.message}`,
    };
  }
}

await registerServiceWorker();

ReactDOM.createRoot(document.querySelector("#root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
