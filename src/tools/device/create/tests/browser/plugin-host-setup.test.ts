// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { pluginHostSetup } from "../../helpers/call/plugin-host-setup.ts";
import {
  INSTALL_IN_CHAT_UI,
  INSTALL_WITH_TOOL,
} from "#src/tools/shared/remote-script/remote-script-setup.ts";

describe("pluginHostSetup", () => {
  it("offers ppal-manage first when the caller has it, then the chat UI", () => {
    const text = pluginHostSetup(true);

    expect(text).toContain(INSTALL_WITH_TOOL);
    expect(text).toContain(INSTALL_IN_CHAT_UI);
  });

  it("sends a caller without ppal-manage to the chat UI alone", () => {
    const text = pluginHostSetup(false);

    expect(text).not.toContain(INSTALL_WITH_TOOL);
    expect(text).not.toContain("ppal-manage");
    expect(text).toContain(INSTALL_IN_CHAT_UI);
  });

  it("warns that Live's browser is slow to see a new file, either way", () => {
    for (const manage of [true, false]) {
      expect(pluginHostSetup(manage)).toContain(
        "Live's browser can take a few seconds to see a new file",
      );
    }
  });
});
