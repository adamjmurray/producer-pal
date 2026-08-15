// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Harness for the subagent specs: a scripted OpenAI-compatible chat endpoint
// standing in for the LLM, so a whole spawn — orchestrator turn, nested worker
// session, result back into the card — runs for real with no API key.
//
// The chat is pointed at the `custom` provider because its base URL is a
// setting: the route can then match this suite's own synthetic origin instead
// of a vendor host. Everything else (MCP, /config, the document) comes from the
// shared stubs.

import { type Locator, type Page, type Route, expect } from "@playwright/test";
import { installStubs } from "../ui-test-helpers";

/** The client-side delegation tool. Mirrors SPAWN_SUBAGENT_TOOL_NAME in
 * webui/src/lib/utils/enabled-tools.ts. */
export const SPAWN_TOOL = "spawn_subagent";

/** Headers a briefing request carries. Mirrors BRIEFING_REQUEST_HEADER and
 * DISABLED_TOOLS_HEADER in src/shared/config.ts. Spelled out rather than
 * imported: these are wire contracts, and a spec that imported the constant
 * would follow a rename instead of catching it. */
export const BRIEFING_HEADER = "x-producer-pal-briefing";
export const DISABLED_TOOLS_HEADER = "x-producer-pal-disabled-tools";

/** One model request, as the stub sees it. */
export interface LlmCall {
  /** Which session is asking: only the orchestrator is offered the spawn tool. */
  caller: "orchestrator" | "worker";
  /** This call's number within its caller kind, 1-based. */
  n: number;
  /** The system instruction sent (a worker's carries its briefing). */
  system: string;
  /** Tool names offered on this request. */
  toolNames: string[];
  /** User/assistant/tool messages sent, serialized for substring assertions. */
  messagesJson: string;
  /** Whether this request ends on a tool result — the model is being asked to
   * speak after a tool returned, not to open a fresh turn. */
  afterToolResult: boolean;
}

/** What the stubbed model answers with. */
export type LlmReply =
  | { text: string }
  | { spawn: { task: string; resumeFrom?: number } }
  | { rateLimited: true };

/** What the specs read back after driving the UI. */
export interface SubagentHarness {
  /** Every model request, in order. */
  calls: LlmCall[];
  /** Request headers of every GET /subagent-briefing. */
  briefings: Array<Record<string, string>>;
}

/** Options for {@link setupSubagentTest}. */
export interface SubagentTestOptions {
  /** The briefing text the server returns; null makes the endpoint 502, the
   * path where a worker keeps ppal-connect and bootstraps itself. */
  briefing?: string | null;
}

/**
 * Install the stubs, point the chat at the scripted endpoint with the Subagent
 * tool enabled, and load the chat UI.
 * @param page - Playwright page
 * @param respond - Answers one model request; called for every turn, worker
 *   sessions included
 * @param options - Briefing behavior
 * @returns The recorder the specs assert against
 */
export async function setupSubagentTest(
  page: Page,
  respond: (call: LlmCall) => LlmReply,
  options: SubagentTestOptions = {},
): Promise<SubagentHarness> {
  const harness: SubagentHarness = { calls: [], briefings: [] };

  await installStubs(page);
  await seedCustomProvider(page);
  await routeBriefing(page, harness, options.briefing);
  await routeChatCompletions(page, harness, respond);
  await page.goto("/chat-ui.html");

  return harness;
}

/**
 * Send a chat message and wait for the turn to be accepted (the input clears).
 * @param page - Playwright page
 * @param text - The message to send
 */
export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder("Type a message...");

  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

/**
 * Subagent cards. `<details>` maps to the group role, and only a card's header
 * carries the robot, so this never picks up the transcript disclosure nested
 * inside one. Pass an index to narrow to one worker's cards — but note a card
 * shows its number only once the run returns a result, so an in-flight card is
 * reachable only through the unnumbered form.
 * @param page - Playwright page
 * @param index - The worker's 1-based number; omit to match every card
 * @returns Locator for the matching cards
 */
export function subagentCard(page: Page, index?: number): Locator {
  return page
    .getByRole("group")
    .filter({ hasText: index == null ? "🤖" : `subagent ${index}` });
}

/**
 * The worker-transcript disclosure nested inside a card. Expand the card first —
 * role queries skip content inside a closed `<details>`.
 * @param card - A {@link subagentCard} locator
 * @returns Locator for the transcript disclosure
 */
export function subagentTranscript(card: Locator): Locator {
  return card.getByRole("group");
}

/**
 * Expand a `<details>` disclosure and wait for it to open.
 * @param disclosure - The details element
 */
export async function expandDisclosure(disclosure: Locator): Promise<void> {
  await disclosure.locator("summary").first().click();
  await expect(disclosure).toHaveAttribute("open", "");
}

// --- Helpers below main exports ---

/** Chat-completions request body, narrowed to what the stub reads. */
interface ChatRequest {
  tools?: Array<{ function?: { name?: string } }>;
  messages?: Array<{ role?: string; content?: unknown }>;
}

/**
 * Point the chat at the `custom` OpenAI-compatible provider on this suite's own
 * origin, with the opt-in Subagent tool switched on.
 * @param page - Playwright page
 */
async function seedCustomProvider(page: Page): Promise<void> {
  await page.addInitScript((spawnTool: string) => {
    localStorage.setItem("producer_pal_current_provider", "custom");
    localStorage.setItem(
      "producer_pal_provider_custom",
      JSON.stringify({
        apiKey: "stub-key",
        model: "stub-model",
        baseUrl: "http://localhost/v1",
        thinking: "Default",
      }),
    );
    localStorage.setItem(
      "producer_pal_enabled_tools",
      JSON.stringify({ [spawnTool]: true }),
    );
  }, SPAWN_TOOL);
}

/**
 * Serve GET /subagent-briefing, recording each request's headers.
 * @param page - Playwright page
 * @param harness - Recorder to append to
 * @param briefing - Briefing text, or null to fail the fetch like an
 *   unreachable Live
 */
async function routeBriefing(
  page: Page,
  harness: SubagentHarness,
  briefing: string | null | undefined,
): Promise<void> {
  await page.route("**/subagent-briefing", async (route: Route) => {
    harness.briefings.push(route.request().headers());

    if (briefing == null) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Live unreachable" }),
      });

      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ briefing }),
    });
  });
}

/**
 * Serve the scripted chat-completions endpoint.
 * @param page - Playwright page
 * @param harness - Recorder to append to
 * @param respond - Answers one model request
 */
async function routeChatCompletions(
  page: Page,
  harness: SubagentHarness,
  respond: (call: LlmCall) => LlmReply,
): Promise<void> {
  await page.route("**/v1/chat/completions", async (route: Route) => {
    const call = describeCall(
      route.request().postDataJSON() as ChatRequest,
      harness.calls,
    );

    harness.calls.push(call);

    const reply = respond(call);

    if ("rateLimited" in reply) {
      // Retry-After rides along as a real 429 would carry it, but the AI SDK
      // surfaces response headers under a different name than our detector
      // reads, so the backoff still comes from the default schedule — the
      // first retry waits ~5s.
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "retry-after": "1" },
        body: JSON.stringify({ error: { message: "rate limit exceeded" } }),
      });

      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: streamBody(reply, call),
    });
  });
}

/**
 * Classify one request. The spawn tool is the tell: workers never get it (the
 * recursion guard strips it), so its presence identifies the orchestrator
 * without depending on call order.
 * @param body - The parsed request body
 * @param previous - Calls recorded so far, for the per-caller counter
 * @returns The described call
 */
function describeCall(body: ChatRequest, previous: LlmCall[]): LlmCall {
  const messages = body.messages ?? [];
  const toolNames = (body.tools ?? []).map((t) => t.function?.name ?? "");
  const caller = toolNames.includes(SPAWN_TOOL) ? "orchestrator" : "worker";
  const system = messages.find((m) => m.role === "system")?.content;

  return {
    caller,
    n: previous.filter((c) => c.caller === caller).length + 1,
    system: typeof system === "string" ? system : "",
    toolNames,
    messagesJson: JSON.stringify(messages.filter((m) => m.role !== "system")),
    afterToolResult: messages.at(-1)?.role === "tool",
  };
}

/**
 * Render a reply as an OpenAI-compatible SSE stream.
 * @param reply - Text or a spawn tool call
 * @param call - The request being answered; its number keys the tool-call id
 * @returns The full event-stream body
 */
function streamBody(
  reply: Exclude<LlmReply, { rateLimited: true }>,
  call: LlmCall,
): string {
  const [delta, finish] =
    "text" in reply
      ? [{ content: reply.text }, "stop"]
      : [
          {
            tool_calls: [
              {
                index: 0,
                id: `call_${call.n}`,
                type: "function",
                function: {
                  name: SPAWN_TOOL,
                  arguments: JSON.stringify(reply.spawn),
                },
              },
            ],
          },
          "tool_calls",
        ];

  return (
    [
      chunk({ role: "assistant", ...delta }, null),
      chunk({}, finish),
      // Without a usage chunk the SDK reports undefined tokens; harmless here,
      // but the UI renders a usage label from it.
      {
        id: "stub",
        object: "chat.completion.chunk",
        created: 0,
        model: "stub-model",
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    ]
      .map((c) => `data: ${JSON.stringify(c)}\n\n`)
      .join("") + "data: [DONE]\n\n"
  );
}

/**
 * One chat-completion chunk.
 * @param delta - The delta payload
 * @param finishReason - Finish reason, or null mid-stream
 * @returns The chunk object
 */
function chunk(delta: object, finishReason: string | null): object {
  return {
    id: "stub",
    object: "chat.completion.chunk",
    created: 0,
    model: "stub-model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}
