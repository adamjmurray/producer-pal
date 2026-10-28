#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Run the remote script's Python unit tests. A script rather than an npm
 * one-liner so it works in cmd.exe too.
 */

import { spawnSync } from "node:child_process";
import { pythonCommand } from "./python-command.ts";

const [command, args] = pythonCommand([
  "-m",
  "unittest",
  "discover",
  "-s",
  "remote-script/tests",
]);
const result = spawnSync(command, args, {
  stdio: "inherit",
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
});

if (result.error != null) {
  console.error(
    `Couldn't run ${command}: ${result.error.message}. Install Python 3 (on Windows, with the py launcher).`,
  );
}

process.exitCode = result.status ?? 1;
