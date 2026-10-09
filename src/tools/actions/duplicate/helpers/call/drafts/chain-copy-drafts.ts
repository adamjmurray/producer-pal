// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The copies a device, chain or drum-pad call makes: one per destination
// toPath names, or one into the source's own rack when it names none.

import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type SourceShare } from "../../sources/source-plan.ts";
import { type CopyDraft } from "../duplicate-call-types.ts";

/**
 * One draft per destination of each device, chain or pad source.
 * @param type - What is being duplicated
 * @param sources - The sources, in call order
 * @returns The drafts, a source's destinations together
 * @throws Error when a drum pad names no destination
 */
export function chainCopyDrafts(
  type: "device" | "chain" | "drum-pad",
  sources: SourceShare[],
): CopyDraft[] {
  const kind = type === "drum-pad" ? "pad" : type;

  return sources.flatMap((source) => {
    const paths = pathEntries(source.toPath, "toPath");

    // Unlike a device, a pad has no natural "next" slot to default to — the
    // next MIDI note is as likely to be occupied as empty — so the caller must
    // say.
    if (kind === "pad" && paths.length === 0) {
      throw new Error("toPath is required for drum pads");
    }

    // Nothing named a destination — a chain or device appending to its own
    // rack — so an entry is addressed by the source the caller did name.
    const destinations = paths.length === 0 ? [undefined] : paths;

    return destinations.map((toPath): CopyDraft => {
      const named =
        toPath == null
          ? source.named
          : { param: "path" as const, value: toPath };

      return source.skip == null
        ? {
            named,
            make: () => ({
              body: {
                kind,
                sourceId: source.id,
                ...(toPath != null && { toPath }),
              },
            }),
          }
        : { named, skip: source.skip };
    });
  });
}
