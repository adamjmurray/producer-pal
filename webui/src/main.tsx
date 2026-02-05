// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { render } from "preact";
import { App } from "#webui/components/App";
import "./main.css";

const appElement = document.getElementById("app");

if (!appElement) {
  throw new Error("Could not find #app element");
}

render(<App />, appElement);
