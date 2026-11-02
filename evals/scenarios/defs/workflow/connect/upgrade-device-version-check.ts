// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: told the device is older than the connector, the model asks, updates
 * on a yes, then re-checks with `versionCheck: true` instead of a full connect.
 *
 * Connect is real with the portal's older-device note appended. The update and
 * the version check are canned (see `connect-manage-overrides.ts`), so nothing is updated.
 * `seedConnect: false` because the connect turn is graded (no update before asking).
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
  connectWithOlderDevice,
  manageOverride,
  updateSuccess,
} from "./helpers/connect-manage-overrides.ts";

const UPDATE = "update-producer-pal";

export const upgradeDeviceVersionCheck: EvalScenario = {
  id: "upgrade-device-version-check",
  tags: ["upgrade"],
  description:
    "Told the device is older, ask, update on a yes, then re-check with versionCheck",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  requires: { tools: [TOOLS.manage] },
  seedConnect: false,
  toolOverrides: {
    [TOOLS.connect]: connectOverride(connectWithOlderDevice),
    [TOOLS.manage]: manageOverride(UPDATE, updateSuccess),
  },

  messages: [CONNECT_MESSAGE, "Yes, update it."],

  assertions: [
    {
      type: "custom",
      description: "asks first: no ppal-manage call in turn 0",
      assert: (turns) =>
        !(turns[0]?.toolCalls ?? []).some((c) => c.name === TOOLS.manage),
    },
    {
      type: "custom",
      description: "turn 1 calls ppal-manage update-producer-pal",
      assert: (turns) => (turns[1]?.toolCalls ?? []).some(isManage(UPDATE)),
    },
    {
      type: "custom",
      description: "turn 1 re-checks with ppal-connect versionCheck: true",
      assert: (turns) => (turns[1]?.toolCalls ?? []).some(isVersionCheck),
    },
    {
      type: "custom",
      description: "no full ppal-connect after turn 0",
      assert: (turns) => !callsFrom(turns, 1).some(isFullConnect),
    },

    { type: "token_usage", maxTokens: 1_500 },

    {
      type: "llm_judge",
      prompt: `Connecting showed the Producer Pal device is older than the connector. The user then said "Yes, update it." and the update succeeded.

Evaluate the assistant's final reply:
1. It says the update worked (the device is now on the newer version).
2. It suggests the user start a new chat so it loads the new version's skills and tools.`,
    },
  ],
};
