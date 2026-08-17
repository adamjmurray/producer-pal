// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// ppal-connect is the one tool whose response is more than the V8 result. The
// Node side appends the skills, the context layers, the memory index, and the
// next-step instruction as separate text blocks — none of them fields on the
// JSON — so an example built from the V8 result alone would show about a third
// of what a client receives.
//
// The blocks come from the real enrichment chain, not from a copy of it. Two
// of them read ~/.producer-pal, which would put whatever is on the build
// machine into the docs, so the config dir is pointed at a fixture first.

import fs from "node:fs/promises";
import { registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";

// The chain reaches the Node-for-Max adapter, which imports `max-api` — a
// module Max provides and npm has never heard of. It only needs to load, not
// work: nothing in the chain sends anything to Max.
const MAX_API_STUB =
  "data:text/javascript,export default { addHandler(){}, post(){}, outlet(){} };";

/** Stands in for the user's ~/.producer-pal while the examples run. */
const EXAMPLE_GLOBAL_CONTEXT =
  "I write downtempo and lo-fi house. Keep arrangements under 3 minutes.";

const EXAMPLE_MEMORY = {
  slug: "prefers-hardware-drums",
  description: "Records drums on hardware, wants MIDI kept out of the kick bus",
  body: "Tracks kick and snare on an external sampler, so MIDI drum parts go on their own track.",
};

/**
 * Run the Node-side connect enrichment over a V8 connect result and return the
 * blocks it appends, in the order a client sees them.
 * @param connectResult - What the V8 connect tool returned
 * @param projectContext - The Live Set's project context blob
 * @returns Each appended block's text
 */
export async function appendedConnectBlocks(
  connectResult: unknown,
  projectContext: string,
): Promise<string[]> {
  process.env.PRODUCER_PAL_CONFIG_DIR = await writeConfigFixture();

  registerHooks({
    resolve: (specifier, context, next) =>
      specifier === "max-api"
        ? { url: MAX_API_STUB, shortCircuit: true }
        : next(specifier, context),
  });

  const { enrichConnect } =
    await import("#src/mcp-server/helpers/connect/enrich-connect.ts");

  const enriched = enrichConnect(
    () =>
      Promise.resolve({
        content: [{ type: "text", text: JSON.stringify(connectResult) }],
      }),
    () => ({
      notation: "barbeat",
      smallModelMode: false,
      projectContext,
    }),
  );

  const response = await enriched("ppal-connect", {});

  // The first block is the JSON result the caller already has.
  return response.content.slice(1).map((block) => block.text);
}

/**
 * Write the stand-in ~/.producer-pal the enrichment chain reads.
 * @returns Absolute path to the fixture config directory
 */
async function writeConfigFixture(): Promise<string> {
  const dir = path.join(os.tmpdir(), "producer-pal-doc-examples");

  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, "memory"), { recursive: true });

  await fs.writeFile(
    path.join(dir, "context.md"),
    `${EXAMPLE_GLOBAL_CONTEXT}\n`,
  );

  await fs.writeFile(
    path.join(dir, "memory", `${EXAMPLE_MEMORY.slug}.md`),
    [
      "---",
      `name: ${EXAMPLE_MEMORY.slug}`,
      `description: ${EXAMPLE_MEMORY.description}`,
      "---",
      "",
      EXAMPLE_MEMORY.body,
      "",
    ].join("\n"),
  );

  return dir;
}
