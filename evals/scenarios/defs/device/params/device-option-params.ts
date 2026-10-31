// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: set option params (filter types, wave shapes, on/off) on big
 * devices by saying what the user wants in plain words.
 *
 * A baseline for the `param-values` read, which lists every option param's
 * choices. EQ Eight repeats the same filter-type list for each of its 16 band
 * slots, and Operator repeats On/Off and wave lists many times. If a change
 * ever shortens that repeated list, the model has to still pick the right
 * option, so this grades only the options the device ends up on.
 *
 * `setup` adds an EQ Eight to the Lead track (`t3/d4`, after its four devices)
 * and an Operator to the 5-MIDI track (`t4/d1`, after Producer Pal). Both get
 * an explicit start state: Live applies the user's default device preset, so a
 * new device can start with an asked-for option already set. Setup throws if
 * one still is. Every option param the user did not ask about must still read
 * as it did after setup.
 *
 * The prompts say what the sound should do ("a notch", "a shelf that lifts the
 * highs"), not the exact option text. EQ Eight has no "Low Cut": that is "High
 * Pass". Only bands 1-4 are used, so a model that also switches a band on is
 * not penalized. Each band has an A and a B side; a model that also gives the B
 * side the option it was asked for is not penalized either.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { type EvalAssertion, type EvalScenario } from "../../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../../clip/helpers/clip-tool-constants.ts";
import { optionValues, paramText } from "../helpers/device-param-readback.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/** One option param the user asks to change, and what it must read as. */
interface Wanted {
  name: string;
  /** What the option must read as */
  option: RegExp;
}

/** A device the scenario adds, and what the user asks of it. */
interface Target {
  deviceName: string;
  /** Where setup appends it, and where it sits afterwards */
  appendPath: string;
  path: string;
  /** Text the read's `type` contains */
  type: string;
  /** Params set after the device is added, so it starts from a known state */
  seed?: { name: string; value: string }[];
  wanted: Wanted[];
}

/** basic-midi-4-track: the Lead track has 4 devices, 5-MIDI has Producer Pal. */
const EQ_EIGHT: Target = {
  deviceName: "EQ Eight",
  appendPath: "t3/d+",
  path: "t3/d4",
  type: "EQ Eight",
  seed: [
    { name: "1 Filter Type A", value: "Low Shelf" },
    { name: "2 Filter Type A", value: "Bell" },
    { name: "3 Filter Type A", value: "Bell" },
    { name: "4 Filter On A", value: "On" },
  ],
  wanted: [
    { name: "3 Filter Type A", option: /notch/i },
    { name: "2 Filter Type A", option: /high shelf/i },
    { name: "4 Filter On A", option: /^off$/i },
    { name: "1 Filter Type A", option: /high pass/i },
  ],
};

const OPERATOR: Target = {
  deviceName: "Operator",
  appendPath: "t4/d+",
  path: "t4/d1",
  type: "Operator",
  seed: [
    { name: "Osc-B On", value: "Off" },
    { name: "Osc-A Wave", value: "Sine" },
    { name: "Osc-B Wave", value: "Sine" },
  ],
  wanted: [
    { name: "Osc-B On", option: /^on$/i },
    { name: "Osc-B Wave", option: /^square/i },
    { name: "Osc-A Wave", option: /^saw/i },
  ],
};

/** Each device's option params as setup left them, by device path. */
const seeded = new Map<string, Record<string, string>>();

/**
 * Read a device with its param values.
 *
 * @param mcpClient - MCP client for tool calls
 * @param path - Device path
 * @returns The parsed read
 */
async function readDevice(mcpClient: Client, path: string): Promise<unknown> {
  return parseToolResult(
    extractToolResultText(
      await mcpClient.callTool({
        name: TOOLS.readDevice,
        arguments: { path, include: ["params", "param-values"] },
      }),
    ),
  );
}

/**
 * What is wrong with the options a device reads back.
 *
 * @param target - The device and what was asked of it
 * @param result - Parsed read of the device
 * @param before - Its option params as setup left them, when known
 * @returns A description of what is wrong, or null when it is as asked
 */
function optionProblems(
  target: Target,
  result: unknown,
  before?: Record<string, string>,
): string | null {
  const problems: string[] = [];
  const asked = new Set<string>();
  const names = (
    (result as { parameters?: { name?: string }[] }).parameters ?? []
  ).map((param) => param.name ?? "");

  for (const { name, option } of target.wanted) {
    const text = paramText(result, name);

    if (text == null) {
      problems.push(
        `no param ${name} (params like it: ${names
          .filter((n) => /wave|osc|\bon\b/i.test(n))
          .slice(0, 12)
          .join(", ")})`,
      );
    } else if (!option.test(text)) {
      problems.push(`${name} reads "${text}", wanted ${option}`);
    }

    asked.add(name);
  }

  for (const [name, text] of Object.entries(optionValues(result))) {
    if (
      !asked.has(name) &&
      !isMirrorOfWanted(target, name, text) &&
      before?.[name] != null &&
      before[name] !== text
    ) {
      problems.push(`${name} changed from "${before[name]}" to "${text}"`);
    }
  }

  return problems.length === 0 ? null : problems.join("; ");
}

/**
 * Whether a param is the B side of an asked-for A-side param, set to the same
 * option the user asked for.
 *
 * @param target - The device and what was asked of it
 * @param name - The param's name
 * @param text - What it reads as
 * @returns True for a B side that mirrors a wanted change
 */
function isMirrorOfWanted(target: Target, name: string, text: string): boolean {
  return target.wanted.some(
    ({ name: wantedName, option }) =>
      wantedName.endsWith(" A") &&
      name === `${wantedName.slice(0, -1)}B` &&
      option.test(text),
  );
}

/**
 * Add the device and set its start state, then check none of the options the
 * user will ask for is already set, and remember how the other options read.
 *
 * @param mcpClient - MCP client for tool calls
 * @param target - The device to add
 */
async function addDevice(mcpClient: Client, target: Target): Promise<void> {
  await mcpClient.callTool({
    name: TOOLS.createDevice,
    arguments: { deviceName: target.deviceName, path: target.appendPath },
  });

  if (target.seed != null) {
    await mcpClient.callTool({
      name: TOOLS.updateDevice,
      arguments: { path: target.path, params: target.seed },
    });
  }

  const read = await readDevice(mcpClient, target.path);
  const type = (read as { type?: string }).type ?? "";

  if (!type.includes(target.type)) {
    throw new Error(
      `seeding ${target.path} failed: reads as type "${type}", wanted ${target.type}`,
    );
  }

  for (const { name, option } of target.wanted) {
    const text = paramText(read, name);

    if (text != null && option.test(text)) {
      throw new Error(
        `seeding ${target.path}: ${name} already reads "${text}"`,
      );
    }
  }

  seeded.set(target.path, optionValues(read));
}

/**
 * A state assertion that a device ended on the options the user asked for.
 *
 * @param target - The device and what was asked of it
 * @returns The assertion
 */
function assertOptions(target: Target): EvalAssertion {
  const problems = (result: unknown): string | null =>
    optionProblems(target, result, seeded.get(target.path));

  return {
    type: "state",
    tool: TOOLS.readDevice,
    args: { path: target.path, include: ["params", "param-values"] },
    expect: (result) => problems(result) == null,
    explain: (result) => problems(result) ?? "options are as asked",
  };
}

export const deviceOptionParams: EvalScenario = {
  id: "device-option-params",
  tags: ["devices"],
  description:
    "Set filter types, wave shapes and on/off on EQ Eight and Operator from plain-word requests",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  judgeAdvisory: true,
  requires: { tools: [TOOLS.readDevice, TOOLS.updateDevice] },

  setup: async (mcpClient) => {
    seeded.clear();
    await addDevice(mcpClient, EQ_EIGHT);
    await addDevice(mcpClient, OPERATOR);
  },

  messages: [
    MSG_CONNECT,
    "On the EQ Eight on the Lead track, make band 3 a notch that removes a narrow slice, and make band 2 a shelf that lifts the highs.",
    "On that EQ Eight, switch band 4 off, and make band 1 a filter that cuts the low end out instead of shelving it.",
    "On the Operator on the 5-MIDI track, switch on oscillator B with a square wave, and give oscillator A a sawtooth wave.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOLS.updateDevice, turn: 1 },
    { type: "tool_called", tool: TOOLS.updateDevice, turn: 2 },
    { type: "tool_called", tool: TOOLS.updateDevice, turn: 3 },

    assertOptions(EQ_EIGHT),
    assertOptions(OPERATOR),

    {
      type: "llm_judge",
      prompt: `The user asked for option changes on an EQ Eight (Lead track) and an Operator
(5-MIDI track): band 3 a notch, band 2 a high shelf, band 4 off, band 1 a
high-pass (low cut) filter, then Operator oscillator B on with a square wave and oscillator A a saw
wave. Evaluate whether each reply says what was actually set, using option
names the device offers. A reply that claims a change the tool results do not
show, or that names an option the device does not list, is a fail.`,
    },
  ],
};
