// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Seeding an audio clip from a scenario `setup`: a new audio track holding one
 * sample in its first slot, made through the same tools the model has. The
 * eval Sets hold no audio, and a Set authored for this would carry a sample
 * path that only fits one machine.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText } from "#evals/chat/mcp.ts";
import { remoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { resolveSamplesPath } from "../../../run-scenario/scenario-config.ts";
import { firstResultPath } from "../../helpers/new-track-path.ts";

/** A sample in `evals/live-sets/samples`, by its path inside that folder. */
export type EvalSample = "drums/kick.aiff" | "sample.aiff";

/**
 * Add an audio track named `name` at the end of the Set, with `sample` as a
 * clip in its first slot. Throws unless the clip is there, so a seed that never
 * took can't pass a scenario for the wrong reason, and unless the remote
 * script answers, since converting a clip needs it.
 *
 * @param mcpClient - MCP client for tool calls
 * @param name - The audio track's name
 * @param sample - The sample the clip plays
 */
export async function seedAudioClip(
  mcpClient: Client,
  name: string,
  sample: EvalSample,
): Promise<void> {
  const ping = await remoteScriptPing();

  if (!ping.running) {
    throw new Error(
      "converting an audio clip needs the Producer Pal remote script, but it isn't answering",
    );
  }

  const track = await callTool(mcpClient, "ppal-create-track", {
    path: "t+",
    type: "audio",
    name,
  });
  const trackPath = firstResultPath(track);

  if (trackPath == null) {
    throw new Error(`ppal-create-track named no path: ${track}`);
  }

  await callTool(mcpClient, "ppal-create-clip", {
    path: `${trackPath}/s0`,
    sampleFile: `${resolveSamplesPath("samples")}/${sample}`,
    // Otherwise Live decides per its own setting, which varies by machine.
    warping: true,
  });
}

/**
 * Call a tool and return its text, throwing when it errors.
 *
 * @param mcpClient - MCP client for tool calls
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns The result text
 */
async function callTool(
  mcpClient: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await mcpClient.callTool({ name, arguments: args });
  const text = extractToolResultText(result);

  if (result.isError === true) {
    throw new Error(`${name} failed while seeding: ${text}`);
  }

  return text;
}
