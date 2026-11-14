// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionTab } from "#webui/components/settings/ConnectionTab";
import { InsecurePageNote } from "#webui/components/settings/helpers/InsecurePageNote";
import { PLAIN_HTTP_KEYS_DOCS_URL } from "#webui/lib/config";
import { makeVoiceSettingsProps } from "#webui/components/settings/tests/helpers/settings-voice-props-test-helpers";

const tabProps = {
  provider: "anthropic" as const,
  setProvider: vi.fn(),
  apiKey: "",
  setApiKey: vi.fn(),
  baseUrl: null,
  model: "m",
  setModel: vi.fn(),
  providerLabel: "Anthropic",
  thinking: "Default",
  setThinking: vi.fn(),
  smallModelMode: false,
  setSmallModelMode: vi.fn(),
  ...makeVoiceSettingsProps(),
};

describe("InsecurePageNote", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a note with a Learn more link on an insecure page", () => {
    vi.stubGlobal("isSecureContext", false);
    render(<InsecurePageNote />);

    expect(screen.getByTestId("insecure-page-note").textContent).toContain(
      "plain HTTP",
    );
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveProperty(
      "href",
      PLAIN_HTTP_KEYS_DOCS_URL,
    );
  });

  it("shows nothing on a secure page", () => {
    vi.stubGlobal("isSecureContext", true);
    render(<InsecurePageNote />);

    expect(screen.queryByTestId("insecure-page-note")).toBeNull();
  });

  it("appears under the API key field only on an insecure page", () => {
    vi.stubGlobal("isSecureContext", false);

    const { unmount } = render(<ConnectionTab {...tabProps} />);

    expect(screen.getByTestId("insecure-page-note")).toBeDefined();
    unmount();

    vi.stubGlobal("isSecureContext", true);
    render(<ConnectionTab {...tabProps} />);
    expect(screen.queryByTestId("insecure-page-note")).toBeNull();
  });

  it("is not shown for local providers, which have no API key field", () => {
    vi.stubGlobal("isSecureContext", false);
    render(<ConnectionTab {...tabProps} provider="ollama" />);

    expect(screen.queryByTestId("insecure-page-note")).toBeNull();
  });
});
