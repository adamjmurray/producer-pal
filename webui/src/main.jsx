import { render } from "preact";
import { App } from "./App";
import "./main.css";

// Mock API for development
window.mockData = {
  notes: `# Project Notes\n\n## TODO\n- [ ] Add reverb\n- [ ] Fix tempo automation`,
};

render(<App />, document.getElementById("app"));
