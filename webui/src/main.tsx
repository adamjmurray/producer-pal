import { render } from "preact";
import { App } from "#webui/components/App";
import "./main.css";

const BUILD_VERSION = "2025-11-25-18:35-HISTORYREF-FIX";
console.log(
  `%c[Producer Pal WebUI] Version: ${BUILD_VERSION}`,
  "font-weight: bold; font-size: 14px; color: #00ff00; background: #000; padding: 4px;",
);

const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("Could not find #app element");
}

render(<App />, appElement);
