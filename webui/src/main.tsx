// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { render } from "preact";
import { App } from "#webui/components/App";
import { ContextApp } from "#webui/components/context/ContextApp";
import { DemoMode } from "#webui/demo/DemoMode";
import "./main.css";

const appElement = document.getElementById("app");

if (!appElement) {
  throw new Error("Could not find #app element");
}

const params = new URLSearchParams(window.location.search);
const isDemo = params.has("demo");
const isContext = window.location.pathname.startsWith("/context");

const root = isDemo ? <DemoMode /> : isContext ? <ContextApp /> : <App />;

render(root, appElement);
