#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The first step of `npm run build`, so every path that produces shipped bytes
// goes through it — the .mcpb/.amxd release, the npm publish, and CI.

import { buildFlagGuard } from "./build-flag-guard.ts";

const refusal = buildFlagGuard(process.env);

if (refusal != null) {
  console.error(refusal);
  process.exit(1);
}
