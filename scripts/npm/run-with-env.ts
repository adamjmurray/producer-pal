#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Run an npm script with extra environment variables. npm scripts run in
 * cmd.exe on Windows, which doesn't understand `VAR=value command`.
 *
 * Usage: node scripts/npm/run-with-env.ts VAR=value [VAR=value ...] script
 */

import { spawnSync } from "node:child_process";
import { npmRunCommand } from "./npm-run-command.ts";

const args = process.argv.slice(2);
const script = args.pop();

if (script == null || script.includes("=")) {
  console.error("Usage: run-with-env.ts VAR=value [VAR=value ...] <script>");
  process.exit(1);
}

const env = { ...process.env };

for (const pair of args) {
  const [name, ...value] = pair.split("=");

  env[name as string] = value.join("=");
}

const [command, commandArgs] = npmRunCommand([script]);
const result = spawnSync(command, commandArgs, { env, stdio: "inherit" });

if (result.error != null) {
  console.error(`Couldn't run npm: ${result.error.message}`);
}

process.exitCode = result.status ?? 1;
