// webui/src/main.jsx
import { render } from "preact";
import "./main.css";
import { App } from "./App";

// Mock API for development
window.mockData = {
  notes: `# Project Notes\n\n## TODO\n- [ ] Add reverb\n- [ ] Fix tempo automation`,
};

render(<App />, document.getElementById("app"));