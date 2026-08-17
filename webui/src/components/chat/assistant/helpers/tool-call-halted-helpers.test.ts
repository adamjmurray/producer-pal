// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  CANCELED_TOOL_RESULT_TEXT,
  FAILED_TOOL_RESULT_TEXT,
} from "#webui/chat/sdk/build-model-messages";
import {
  haltedToolStatus,
  unwrapToolResultText,
} from "./tool-call-halted-helpers";

describe("haltedToolStatus", () => {
  it("reads a canceled placeholder as stopped", () => {
    expect(haltedToolStatus(JSON.stringify(CANCELED_TOOL_RESULT_TEXT))).toBe(
      "stopped",
    );
  });

  it("reads a failed placeholder as interrupted", () => {
    expect(haltedToolStatus(JSON.stringify(FAILED_TOOL_RESULT_TEXT))).toBe(
      "interrupted",
    );
  });

  it("reads an unquoted placeholder too", () => {
    expect(haltedToolStatus(FAILED_TOOL_RESULT_TEXT)).toBe("interrupted");
  });

  it("returns null for a running call", () => {
    expect(haltedToolStatus(null)).toBeNull();
  });

  it("returns null for a real result", () => {
    expect(haltedToolStatus('{"id":"44"}')).toBeNull();
  });
});

describe("unwrapToolResultText", () => {
  it("unwraps a JSON-quoted string", () => {
    expect(unwrapToolResultText('"Done."')).toBe("Done.");
  });

  it("returns non-string JSON verbatim", () => {
    expect(unwrapToolResultText('{"id":"44"}')).toBe('{"id":"44"}');
  });

  it("returns unparseable text verbatim", () => {
    expect(unwrapToolResultText("not json")).toBe("not json");
  });
});
