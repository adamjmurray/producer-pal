// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { render } from "preact";
import { App } from "#webui/components/App";
import { DemoMode } from "#webui/demo/DemoMode";
import "./main.css";

const appElement = document.getElementById("app");

if (!appElement) {
  throw new Error("Could not find #app element");
}

const isDemo = new URLSearchParams(window.location.search).has("demo");

render(isDemo ? <DemoMode /> : <App />, appElement);
