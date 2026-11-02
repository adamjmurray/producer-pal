// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { render } from "preact";
import { App } from "#webui/components/App";
import { ContextApp } from "#webui/components/context/ContextApp";
import { GenLayout } from "#webui/components/gen/GenLayout";
import { DemoMode } from "#webui/demo/DemoMode";
import "./main.css";

const appElement = document.getElementById("app");

if (!appElement) {
  throw new Error("Could not find #app element");
}

const params = new URLSearchParams(window.location.search);
const isDemo = params.has("demo");
const isContext = window.location.pathname.startsWith("/context");
// Hidden and experimental: reached only by typing /chat?view=gen, and only in a
// gen-UI build. The flag is a build-time constant, so a release drops the panel.
const isGen =
  process.env.ENABLE_GEN_UI === "true" && params.get("view") === "gen";

const root = isDemo ? (
  <DemoMode />
) : isContext ? (
  <ContextApp />
) : isGen ? (
  <GenLayout />
) : (
  <App />
);

render(root, appElement);
