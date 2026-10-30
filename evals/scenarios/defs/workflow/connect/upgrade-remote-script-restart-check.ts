// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: told the remote script is behind, the model installs on a yes, has
 * the user restart Live, then re-checks with `versionCheck: true`.
 *
 * Connect is real with its remote script line swapped for the "behind" one. The
 * install and the version check are canned (see `connect-manage-overrides.ts`), so nothing
 * is installed. `seedConnect: false` because the connect turn is graded (the model reads the line itself).
 */

import { TOOLS } from "#evals/shared/tool-names.ts";
import { CONNECT_MESSAGE } from "../../../helpers/seed-connect/seed-connect.ts";
import { type EvalScenario } from "../../../types.ts";
import {
  callsFrom,
  isFullConnect,
  isManage,
  isVersionCheck,
} from "./helpers/connect-calls.ts";
import {
  connectOverride,
  connectWithBehindScript,
  installSuccess,
  manageOverride,
} from "./helpers/connect-manage-overrides.ts";

const INSTALL = "install-producer-pal";

export const upgradeRemoteScriptRestartCheck: EvalScenario = {
  id: "upgrade-remote-script-restart-check",
  tags: ["upgrade"],
  description:
    "Remote script behind: install on a yes, have the user restart Live, then re-check with versionCheck",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  requires: { tools: [TOOLS.manage] },
  seedConnect: false,
  toolOverrides: {
    [TOOLS.connect]: connectOverride(connectWithBehindScript),
    [TOOLS.manage]: manageOverride(INSTALL, installSuccess),
  },

  messages: [
    CONNECT_MESSAGE,
    "Yes, go ahead and update it.",
    "OK, I restarted Live.",
  ],

  assertions: [
    {
      type: "custom",
      description:
        "calls ppal-manage install-producer-pal in turn 0 or 1 (the line doesn't say to ask first)",
      assert: (turns) =>
        turns.slice(0, 2).some((t) => t.toolCalls.some(isManage(INSTALL))),
    },
    {
      type: "response_contains",
      pattern: /restart/i,
      turn: "any",
    },
    {
      type: "custom",
      description: "turn 2 re-checks with ppal-connect versionCheck: true",
      assert: (turns) => (turns[2]?.toolCalls ?? []).some(isVersionCheck),
    },
    {
      type: "custom",
      description: "no full ppal-connect after turn 0",
      assert: (turns) => !callsFrom(turns, 1).some(isFullConnect),
    },
    {
      type: "custom",
      description: "turn 2 does not install again",
      assert: (turns) => !(turns[2]?.toolCalls ?? []).some(isManage(INSTALL)),
    },

    { type: "token_usage", maxTokens: 2_000 },

    {
      type: "llm_judge",
      prompt: `Connecting showed the Producer Pal remote script is behind the device. The user agreed to update it, the install succeeded, and later the user said they restarted Live.

Evaluate the assistant's replies:
1. After the install, it tells the user to restart Live before anything else. (The remote script was already running, so leaving out the first-install Control Surface step is fine.)
2. After "OK, I restarted Live.", it re-checks versions without installing again, and says everything is up to date.
3. That final reply suggests the user start a new chat so it loads the new version's skills and tools.
4. It claims nothing the tool results did not show.`,
    },
  ],
};
