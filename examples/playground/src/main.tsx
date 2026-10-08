import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./icons";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// a built page arrives prerendered (scripts/prerender.tsx): take it over, do not redraw it
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
