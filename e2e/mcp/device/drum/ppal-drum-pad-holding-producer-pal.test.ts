// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for delete and duplicate refusing a drum pad that holds the
 * Producer Pal device. Our tools won't put the device in a pad, so the Set
 * has it there already. It's the only copy in the Set, so a guard that let
 * the delete through would drop the connection.
 * Uses: ppal-drum-pad (t0/d0 is a Drum Rack: pC1 holds Producer Pal, pD1 a
 * Simpler)
 * See: e2e/live-sets/specs/ppal-drum-pad-spec.md
 *
 * Run with: npm run e2e:mcp -- device/drum/ppal-drum-pad-holding-producer-pal
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";
import { PPAL_DRUM_PAD_PATH } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ liveSetPath: PPAL_DRUM_PAD_PATH });

const RACK = "t0/d0";
const HOST_PAD = `${RACK}/pC1`;
const OTHER_PAD = `${RACK}/pD1`;
const HOST_DEVICE = `${HOST_PAD}/c0/d0`;

interface Entry {
  id?: string;
  path?: string;
  ok?: false;
  detail?: string;
}

interface Pad {
  id: string;
  path: string;
}

let hostPadId: string;
let deleteRefusal: string;
const DUPLICATE_REFUSAL =
  "cannot duplicate drum pad C1: it holds the Producer Pal device";

beforeEach(async () => {
  hostPadId = (await readPad(HOST_PAD)).id;
  deleteRefusal = `cannot delete drum pad ${HOST_PAD} (id ${hostPadId}): it holds the Producer Pal device`;
});

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return await ctx.client!.callTool({ name, arguments: args });
}

async function readPad(path: string): Promise<Pad> {
  return parseToolResult<Pad>(await call("ppal-read-device", { path }));
}

/** The pads the rack holds, by path. */
async function padPaths(): Promise<string[]> {
  const rack = parseToolResult<{ drumPads: Pad[] }>(
    await call("ppal-read-device", { path: RACK, include: ["drum-pads"] }),
  );

  return rack.drumPads.map((pad) => pad.path);
}

/**
 * Assert the Producer Pal device is still in its pad. The read itself is a
 * round trip through it, so it also shows the connection survived.
 */
async function expectHostSurvived(): Promise<void> {
  const device = parseToolResult<{ name: string }>(
    await call("ppal-read-device", { path: HOST_DEVICE }),
  );

  expect(device.name).toBe("Producer_Pal");
}

describe("ppal-delete on a drum pad holding Producer Pal", () => {
  it("refuses the pad, and the device stays", async () => {
    const result = await call("ppal-delete", {
      type: "drum-pad",
      path: HOST_PAD,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toBe(`Error: ${deleteRefusal}`);
    await expectHostSurvived();
    expect(await padPaths()).toStrictEqual([HOST_PAD, OTHER_PAD]);
  });

  it("still clears the other pad named with it, by path or by id", async () => {
    const otherId = (await readPad(OTHER_PAD)).id;
    const data = parseToolResult<Entry[]>(
      await call("ppal-delete", {
        type: "drum-pad",
        id: `${hostPadId},${otherId}`,
      }),
    );

    expect(data).toStrictEqual([
      { id: hostPadId, ok: false, detail: deleteRefusal },
      { id: otherId, path: OTHER_PAD },
    ]);
    await expectHostSurvived();
    expect(await padPaths()).toStrictEqual([HOST_PAD]);
  });
});

describe("ppal-duplicate on a drum pad holding Producer Pal", () => {
  it("refuses a copy of the pad, and still makes the copy beside it", async () => {
    const alone = await call("ppal-duplicate", {
      type: "drum-pad",
      path: HOST_PAD,
      toPath: `${RACK}/pE1`,
    });

    expect(isToolError(alone)).toBe(true);
    expect(getToolErrorMessage(alone)).toBe(`Error: ${DUPLICATE_REFUSAL}`);

    const data = parseToolResult<Entry[]>(
      await call("ppal-duplicate", {
        type: "drum-pad",
        path: `${HOST_PAD},${OTHER_PAD}`,
        toPath: `${RACK}/pE1,${RACK}/pF1`,
      }),
    );

    expect(data).toStrictEqual([
      { path: `${RACK}/pE1`, ok: false, detail: DUPLICATE_REFUSAL },
      { id: (await readPad(`${RACK}/pF1`)).id, path: `${RACK}/pF1` },
    ]);
    await expectHostSurvived();
    expect(await padPaths()).toStrictEqual([
      HOST_PAD,
      OTHER_PAD,
      `${RACK}/pF1`,
    ]);
  });
});
