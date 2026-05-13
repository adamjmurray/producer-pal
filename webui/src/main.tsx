// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { render } from "preact";
import { App } from "#webui/components/App";
import { VoiceApp } from "#webui/components/voice/VoiceApp";
import { DemoMode } from "#webui/demo/DemoMode";
import "./main.css";

const appElement = document.getElementById("app");

if (!appElement) {
  throw new Error("Could not find #app element");
}

const params = new URLSearchParams(window.location.search);
const isDemo = params.has("demo");
const isVoice =
  params.get("view") === "voice" ||
  window.location.pathname.replace(/\/$/, "") === "/voice";

render(isDemo ? <DemoMode /> : isVoice ? <VoiceApp /> : <App />, appElement);
