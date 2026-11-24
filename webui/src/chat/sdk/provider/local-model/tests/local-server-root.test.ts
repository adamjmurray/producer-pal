// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { localServerRoot } from "#webui/chat/sdk/provider/local-model/local-server-root";

describe("localServerRoot", () => {
  it.each([
    ["http://localhost:11434", "http://localhost:11434"],
    ["http://localhost:11434/", "http://localhost:11434"],
    ["http://localhost:11434/v1", "http://localhost:11434"],
    ["http://localhost:11434/v1/", "http://localhost:11434"],
    ["https://host/ollama", "https://host/ollama"],
    ["https://host/ollama/", "https://host/ollama"],
    ["https://host/ollama/v1", "https://host/ollama"],
    ["https://host/ollama/v1/", "https://host/ollama"],
    ["https://host/a/b/v1", "https://host/a/b"],
    ["https://host/v1beta", "https://host/v1beta"],
  ])("turns %s into %s", (baseUrl, root) => {
    expect(localServerRoot(baseUrl)).toBe(root);
  });

  it("throws for a URL that doesn't parse", () => {
    expect(() => localServerRoot("not a url")).toThrow(TypeError);
  });
});
