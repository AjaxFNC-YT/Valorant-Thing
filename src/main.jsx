import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// import OverlayWindow from "./components/OverlayWindow";
import NotificationOverlayWindow from "./components/NotificationOverlayWindow";
import "./index.css";

const params = new URLSearchParams(window.location.search);
// const isOverlay = params.has("overlay");
const isNotification = params.has("notification");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isNotification ? <NotificationOverlayWindow /> : <App />}
  </React.StrictMode>
);
