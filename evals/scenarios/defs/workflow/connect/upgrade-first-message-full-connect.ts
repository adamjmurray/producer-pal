// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: asked to update as the chat's very first message, the model does a
 * full connect, not only a version check, since this chat has no Skills yet.
 *
 * The update is canned, worded as when no connect has gone through the portal
 * yet (see `connect-manage-overrides.ts`); a plain connect is real. If the
 * model calls `versionCheck: true` anyway, that is canned too so the run goes on.
 */

import { TOOLS } from "#evals/shared/tool-names.ts";
import { type EvalScenario } from "../../../types.ts";
import {
  callsFrom,
  isFullConnect,
  isManage,
  isVersionCheck,
} from "./helpers/connect-calls.ts";
import {
  connectOverride,
  manageOverride,
  updateSuccess,
} from "./helpers/connect-manage-overrides.ts";

const UPDATE = "update-producer-pal";

export const upgradeFirstMessageFullConnect: EvalScenario = {
  id: "upgrade-first-message-full-connect",
  tags: ["upgrade"],
  description:
    "Asked to update as the first message, do a full connect, not only a version check",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  requires: { tools: [TOOLS.manage] },
  seedConnect: false,
  toolOverrides: {
    [TOOLS.connect]: connectOverride(),
    [TOOLS.manage]: manageOverride(UPDATE, () => updateSuccess(false)),
  },

  messages: ["Update the Producer Pal device in Live to the latest version."],

  assertions: [
    {
      type: "custom",
      description: "calls ppal-manage update-producer-pal",
      assert: (turns) => callsFrom(turns, 0).some(isManage(UPDATE)),
    },
    {
      type: "custom",
      description: "does a full ppal-connect (the chat has no Skills yet)",
      assert: (turns) => callsFrom(turns, 0).some(isFullConnect),
    },
    {
      type: "custom",
      description: "no version-check-only connect before a full connect",
      assert: (turns) => {
        const connects = callsFrom(turns, 0).filter(
          (c) => c.name === TOOLS.connect,
        );
        const firstFull = connects.findIndex(isFullConnect);
        const firstCheck = connects.findIndex(isVersionCheck);

        return firstCheck < 0 || (firstFull >= 0 && firstFull < firstCheck);
      },
    },

    { type: "token_usage", maxTokens: 1_200 },
  ],
};
