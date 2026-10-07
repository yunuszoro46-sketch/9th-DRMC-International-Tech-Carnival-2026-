import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts.js";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/layout.css";
import "./styles/public.css";
import "./styles/organizer.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
