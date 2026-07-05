import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MarkweaveEditorPlayground } from "./MarkweaveEditorPlayground";
import "markweave/styles.css";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <MarkweaveEditorPlayground />
  </StrictMode>,
);
