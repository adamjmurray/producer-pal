#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Build the chat UI with the generative-UI panel into test-reports/gen-ui, for
 * the browser specs in e2e/ui/gen. The release UI has no panel. This is a script
 * rather than an npm script because package.json may not name a build flag.
 */

import { spawnSync } from "node:child_process";
import { npmRunCommand } from "./npm-run-command.ts";

const [command, commandArgs] = npmRunCommand(["ui:build"]);
const result = spawnSync(command, commandArgs, {
  env: {
    ...process.env,
    ENABLE_GEN_UI: "true",
    CHAT_UI_OUT_DIR: "test-reports/gen-ui",
  },
  stdio: "inherit",
});

if (result.error != null) {
  console.error(`Couldn't run npm: ${result.error.message}`);
}

process.exitCode = result.status ?? 1;
