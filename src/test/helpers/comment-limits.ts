// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The comment-slop ratchet: the caps that src/test/comment-limits.test.ts
// enforces and `npm run comment:stats` prints beside the current numbers.
//
// THE RULE: when a number falls, lower its cap to match. Raising one needs the
// user's approval — otherwise a verbose comment pays for itself by widening the
// budget, which is what the ratchet exists to stop.
//
// Both caps measure the comments, not the file layout: splitting, merging or
// renaming files leaves them where they were. Moving a long block is the one
// exception — its allowance entry moves with it.

import { type CommentTree } from "./comment-scan-helpers.ts";

/** One cap per tree. */
export type TreeLimits = Record<CommentTree, number>;

/**
 * Cap on comment lines per code line, to 3 decimals. A density rather than a
 * count, so deleting code can't tighten it and adding code can't loosen it.
 * Each cap sits within 0.005 of its tree's density.
 */
export const COMMENT_DENSITY_LIMITS: TreeLimits = {
  src: 0.535,
  scripts: 0.325,
  webui: 0.46,
  evals: 0.49,
  e2e: 0.585,
};

/**
 * The longest comment block any file may hold. One number for every tree: it
 * never ratchets and is never raised. Files that were already over it when the
 * cap landed are listed in LONG_BLOCK_ALLOWANCES.
 */
export const MAX_BLOCK_LINES = 25;

/**
 * Files holding a block over MAX_BLOCK_LINES, mapped to the longest block each
 * may hold today. Every entry must equal that file's actual longest block, so
 * trimming a block means lowering its entry in the same commit.
 *
 * Entries only shrink or disappear. Adding one or raising one needs the user's
 * approval, and a file whose longest block drops to MAX_BLOCK_LINES or under is
 * removed from the list.
 */
export const LONG_BLOCK_ALLOWANCES: Record<string, number> = {
  "evals/schema-compat/probe-schema-compat-cli.ts": 27,
  "evals/schema-compat/probe-schema-compat.ts": 26,
  "evals/scenarios/defs/clip/notation/arpeggio-bracket-idiom.ts": 27,
  "evals/scenarios/defs/clip/notation/pretransforms-slm.ts": 26,
  "evals/scenarios/defs/clip/transforms/note-ops-roll-and-merge.ts": 32,
  "evals/scenarios/defs/context/context-onboarding.ts": 26,
  "evals/scenarios/defs/context/context-write-layers.ts": 27,
  "evals/scenarios/defs/context/helpers/context-scenario-setup.ts": 30,
  "evals/scenarios/defs/device/device-sound-design.ts": 28,
  "evals/scenarios/defs/result/write-result-trust.ts": 27,
  "scripts/probes/live-api-context-probe.ts": 36,
  "scripts/probes/skill-recall-probe.ts": 27,
  "scripts/probes/tool-call-cost-probe.ts": 39,
  "src/live-api-adapter/live-api-build-stats.ts": 34,
  "src/live-api-adapter/live-api-build.ts": 57,
  "src/live-api-adapter/live-api-release.ts": 72,
  "src/mcp-server/helpers/connect/next-step-inject.ts": 37,
  "src/mcp-server/helpers/project-context-backup/project-context-backup-store.ts": 42,
  "src/mcp-server/live-library/list-plugins.ts": 29,
  "src/mcp-server/routes/subagent-briefing-route.ts": 29,
  "src/notation/barbeat/time/barbeat-time.ts": 32,
  "src/notation/stark/stark-serializer.ts": 39,
  "src/shared/max/v8-warning-capture.ts": 37,
  "src/skills/build-skills.ts": 28,
  "src/skills/fragments/transforms/transforms-core.ts": 42,
  "src/skills/notation/barbeat-standard.ts": 28,
  "src/skills/skill-slots.ts": 34,
  "src/tools/actions/duplicate/duplicate.ts": 27,
  "src/tools/clip/create/create-clip.ts": 30,
  "src/tools/clip/create/helpers/clip-iteration.ts": 27,
  "src/tools/clip/update/helpers/process-single-clip-update.ts": 32,
  "src/tools/clip/update/update-clip.ts": 41,
  "src/tools/core/helpers/project-context-operations.ts": 68,
  "src/tools/device/update/update-device.ts": 32,
  "src/tools/shared/arrangement/arrangement-tiling-workaround.ts": 29,
  "src/tools/shared/arrangement/helpers/take-lanes.ts": 26,
  "src/tools/shared/device/helpers/nested-param-target.ts": 29,
  "src/tools/track/update/update-track.ts": 32,
  "webui/src/chat/helpers/mcp-client-connection.ts": 27,
  "webui/src/chat/sdk/build-model-messages.ts": 27,
  "webui/src/chat/sdk/client.ts": 35,
  "webui/src/chat/sdk/subagent/spawn-subagent-tool.ts": 44,
  "webui/src/components/App.tsx": 29,
  "webui/src/components/chat/ChatScreen.tsx": 32,
  "webui/src/components/context/memory/MemoryEntryEditor.tsx": 26,
  "webui/src/hooks/chat/helpers/streaming/connect-client.ts": 34,
  "webui/src/hooks/use-first-send-gate.ts": 46,
};

/** Cap on how many files may hold an allowance. */
export const MAX_LONG_BLOCK_ALLOWANCES = 48;
