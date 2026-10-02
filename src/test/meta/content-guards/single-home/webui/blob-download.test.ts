// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Four places wrote out Blob → object URL → anchor → click → revoke. The
// browser sandbox is fussy about the order, so it lives in one function.
const BLOB_ANCHOR = /URL\.createObjectURL\(blob\)/;

const HOME = "webui/src/utils/text-file-io.ts";

describe("file downloads have one home", () => {
  it("builds the download anchor in downloadTextFile only", () => {
    expect(
      filesContaining("webui/src", BLOB_ANCHOR),
      "call downloadTextFile with the file's MIME type",
    ).toStrictEqual([HOME]);
  });
});
