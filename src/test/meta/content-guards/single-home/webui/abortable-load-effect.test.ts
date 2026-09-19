// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Five hooks each opened an AbortController in an effect, ran a read with its
// signal, and aborted it on the way out. useAbortableLoad owns that now; a
// caller passes a memoized loader, so its dependencies stay its own.
const ABORT_ON_CLEANUP = /return \(\) => controller\.abort\(\)/;

const HOME = "webui/src/hooks/connection/use-abortable-load.ts";

describe("the abortable load effect has one home", () => {
  it("aborts an effect's own controller from use-abortable-load.ts only", () => {
    expect(
      filesContaining("webui/src", ABORT_ON_CLEANUP),
      "load through useAbortableLoad",
    ).toStrictEqual([HOME]);
  });
});
