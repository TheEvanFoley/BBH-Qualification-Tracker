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
    await navigator.serviceWorker.register("/sw.js");
    return {
      status: "ready",
      message: "Companion app shell is ready. Add this page to your home screen.",
    };
  } catch (error) {
    return {
      status: "error",
      message: `Service worker setup failed: ${error.message}`,
    };
  }
}

const serviceWorkerState = await registerServiceWorker();

ReactDOM.createRoot(document.querySelector("#root")).render(
  <React.StrictMode>
    <App serviceWorkerState={serviceWorkerState} />
  </React.StrictMode>,
);
