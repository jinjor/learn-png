import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import "./style.css";

const root = createRoot(document.getElementById("root"));
root.render(<App />);
