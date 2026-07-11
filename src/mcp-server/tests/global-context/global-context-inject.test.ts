// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  withGlobalContext,
  withProjectContext,
} from "#src/mcp-server/helpers/global-context/global-context-inject.ts";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

const getDir = useTempConfigDir();

describe("withGlobalContext", () => {
  it("appends a labeled global-context block to a ppal-connect response", async () => {
    writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");
    const inner = fakeInnerCall(connectResponse());

    const result = await withGlobalContext(inner)("ppal-connect", {});

    expect(result.content).toHaveLength(2);
    const appended = result.content[1]?.text ?? "";

    expect(appended).toContain("Global context");
    expect(appended).toContain("I make ambient techno.");
  });

  it("passes the original tool, args, and overrides through to the inner", async () => {
    const inner = fakeInnerCall(connectResponse());
    const overrides = { timeoutMs: 5000 };

    await withGlobalContext(inner)("ppal-connect", { foo: 1 }, overrides);

    expect(inner).toHaveBeenCalledWith("ppal-connect", { foo: 1 }, overrides);
  });

  it("trims surrounding whitespace from the injected block", async () => {
    writeFileSync(join(getDir(), "context.md"), "  I make ambient techno.\n\n");
    const inner = fakeInnerCall(connectResponse());

    const result = await withGlobalContext(inner)("ppal-connect", {});

    const appended = result.content[1]?.text ?? "";

    expect(appended.endsWith("I make ambient techno.")).toBe(true);
  });

  it("does not inject when there is no global context file", async () => {
    const inner = fakeInnerCall(connectResponse());

    const result = await withGlobalContext(inner)("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });

  it("does not inject when the file is only whitespace", async () => {
    writeFileSync(join(getDir(), "context.md"), "   \n\n  ");
    const inner = fakeInnerCall(connectResponse());

    const result = await withGlobalContext(inner)("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });

  it("leaves non-connect tool responses untouched", async () => {
    writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");
    const inner = fakeInnerCall(connectResponse());

    const result = await withGlobalContext(inner)("ppal-read-track", {});

    expect(result.content).toHaveLength(1);
  });

  it("does not inject when the connect response is an error", async () => {
    writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");
    const inner = fakeInnerCall({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    });

    const result = await withGlobalContext(inner)("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });
});

// Project context reads from the Max device config (a getter), not the
// filesystem, so these tests pass the blob directly instead of writing a file.
describe("withProjectContext", () => {
  it("appends a labeled project-context block to a ppal-connect response", async () => {
    const inner = fakeInnerCall(connectResponse());

    const result = await withProjectContext(
      inner,
      () => "House track, heavy bass.",
    )("ppal-connect", {});

    expect(result.content).toHaveLength(2);
    const appended = result.content[1]?.text ?? "";

    expect(appended).toContain("Project context (this Live Set):");
    expect(appended).toContain("House track, heavy bass.");
  });

  it("trims surrounding whitespace from the injected block", async () => {
    const inner = fakeInnerCall(connectResponse());

    const result = await withProjectContext(inner, () => "  House track.\n\n")(
      "ppal-connect",
      {},
    );

    const appended = result.content[1]?.text ?? "";

    expect(appended.endsWith("House track.")).toBe(true);
  });

  it("does not inject when the project context is empty or only whitespace", async () => {
    const inner = fakeInnerCall(connectResponse());

    const result = await withProjectContext(inner, () => "   \n")(
      "ppal-connect",
      {},
    );

    expect(result.content).toHaveLength(1);
  });

  it("leaves non-connect tool responses untouched", async () => {
    const inner = fakeInnerCall(connectResponse());

    const result = await withProjectContext(inner, () => "notes")(
      "ppal-read-track",
      {},
    );

    expect(result.content).toHaveLength(1);
  });
});
