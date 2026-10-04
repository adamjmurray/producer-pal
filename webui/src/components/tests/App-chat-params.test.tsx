// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { afterEach, describe, expect, it, type vi } from "vitest";
import "./App-mocks-test-helpers";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { SUBAGENT_PRESET_PARAM } from "#webui/hooks/settings/presets/preset-extra-params";
import { PRESETS_STORAGE_KEY } from "#webui/hooks/settings/presets/preset-storage";
import { setSystemPromptStatus } from "./App-context-mocks";
import { installAppTestSetup, mockSettingsHook } from "./App-test-helpers";
import { App } from "#webui/components/App";

/**
 * The extraParams App handed to useChat on the latest render.
 * @returns The extraParams object
 */
function lastExtraParams(): Record<string, unknown> {
  const props = (useChat as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as
    | { extraParams: Record<string, unknown> }
    | undefined;

  return props?.extraParams ?? {};
}

describe("App chat params", () => {
  installAppTestSetup();

  afterEach(() => {
    setSystemPromptStatus(null);
    localStorage.clear();
  });

  it("sends the custom system prompt once it has loaded", () => {
    setSystemPromptStatus({ kind: "ready", content: "Be terse." });
    render(<App />);

    expect(lastExtraParams().systemInstructionOverride).toBe("Be terse.");
  });

  it("sends no override while the custom system prompt is still loading", () => {
    setSystemPromptStatus({ kind: "loading" });
    render(<App />);

    expect(lastExtraParams().systemInstructionOverride).toBe("");
  });

  it("resolves the chosen subagent preset from saved presets", () => {
    localStorage.setItem(
      PRESETS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "p1",
          name: "Worker",
          provider: "gemini",
          model: "gemini-worker",
          thinking: "Off",
          smallModelMode: true,
        },
      ]),
    );
    (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockSettingsHook,
      subagentPresetId: "p1",
    });
    render(<App />);

    expect(lastExtraParams()[SUBAGENT_PRESET_PARAM]).toStrictEqual(
      expect.objectContaining({ model: "gemini-worker", smallModelMode: true }),
    );
  });
});
