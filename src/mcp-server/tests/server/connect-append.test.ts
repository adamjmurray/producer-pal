// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Max from "max-api";
import { describe, expect, it, vi } from "vitest";
import { withConnectAppend } from "#src/mcp-server/helpers/connect/connect-append.ts";
import { withGlobalContext } from "#src/mcp-server/helpers/global-context/global-context-inject.ts";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

const getDir = useTempConfigDir();

describe("withConnectAppend when a block can't be produced", () => {
  it("skips the failing block, keeps the others, and leaks no path", async () => {
    const failing = withConnectAppend(fakeInnerCall(connectResponse()), () => {
      throw new Error("EACCES: permission denied, open '/secret/dir/x.md'");
    });
    const wrapped = withConnectAppend(failing, () => "second block");

    const result = await wrapped("ppal-connect", {});

    expect(result.isError).not.toBe(true);
    expect(result.content.map((c) => c.text)).toStrictEqual([
      expect.any(String),
      "second block",
    ]);
    expect(JSON.stringify(result)).not.toContain("/secret");
  });

  it("warns to the Max console, naming the path there only", async () => {
    vi.mocked(Max.post).mockClear();
    const wrapped = withConnectAppend(fakeInnerCall(connectResponse()), () => {
      throw new Error("boom");
    });

    await wrapped("ppal-connect", {});

    expect(Max.post).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
      Max.POST_LEVELS.WARN,
    );
  });

  it("still connects when context.md is a directory", async () => {
    mkdirSync(join(getDir(), "context.md"));
    const result = await withGlobalContext(fakeInnerCall(connectResponse()))(
      "ppal-connect",
      {},
    );

    expect(result.content).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(getDir());
  });

  it("injects context.md normally when readable", async () => {
    writeFileSync(join(getDir(), "context.md"), "hello");
    const result = await withGlobalContext(fakeInnerCall(connectResponse()))(
      "ppal-connect",
      {},
    );

    expect(result.content).toHaveLength(2);
  });
});
