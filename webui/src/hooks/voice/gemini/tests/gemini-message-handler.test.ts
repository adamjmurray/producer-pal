// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Session } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { handleGeminiMessage } from "#webui/hooks/voice/gemini/gemini-message-handler";
import {
  GEM_ITEM_ID,
  makeMessageDeps,
  msg,
} from "#webui/hooks/voice/gemini/tests/gemini-message-handler-test-helpers";

describe("handleGeminiMessage", () => {
  it("appends input transcription to history", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ serverContent: { inputTranscription: { text: "hello" } } }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      role: "user",
      status: "completed",
      content: [{ type: "input_audio", transcript: "hello" }],
    });
    expect(deps.publishHistory).toHaveBeenCalled();
  });

  it("appends output transcription and enqueues audio", async () => {
    const { deps, player } = makeMessageDeps();

    await handleGeminiMessage(
      msg({
        serverContent: {
          outputTranscription: { text: "hi" },
          modelTurn: { parts: [{ inlineData: { data: "BASE64" } }] },
        },
      }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [{ type: "output_audio", transcript: "hi" }],
    });
    expect(player.enqueueBase64).toHaveBeenCalledWith("BASE64");
    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(true);
  });

  it("ignores model-turn parts that carry no audio data", async () => {
    const { deps, player } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ serverContent: { modelTurn: { parts: [{ text: "no audio" }] } } }),
      deps,
    );

    expect(player.enqueueBase64).not.toHaveBeenCalled();
  });

  it("flushes playback and stops speaking on interruption", async () => {
    const { deps, player } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ serverContent: { interrupted: true } }),
      deps,
    );

    expect(player.flush).toHaveBeenCalled();
    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(false);
  });

  it("stops speaking on turnComplete", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ serverContent: { turnComplete: true } }),
      deps,
    );

    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(false);
    expect(deps.publishHistory).toHaveBeenCalled();
  });

  it("ignores a message with no serverContent or toolCall", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(msg({ setupComplete: {} }), deps);

    expect(deps.publishHistory).not.toHaveBeenCalled();
  });

  it("stores a resumable session-resumption handle", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: true, newHandle: "h-1" } }),
      deps,
    );

    expect(deps.setResumeHandle).toHaveBeenCalledWith("h-1");
  });

  it("ignores a non-resumable update and one with no handle", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: false } }),
      deps,
    );
    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: true } }),
      deps,
    );

    expect(deps.setResumeHandle).not.toHaveBeenCalled();
  });

  it("runs a tool call and sends the response with matching id", async () => {
    const executeTool = vi.fn(async () => "Tempo updated.");
    const { deps, sendToolResponse } = makeMessageDeps({ executeTool });

    const message = msg({
      toolCall: {
        functionCalls: [
          { id: "c1", name: "ppal-update-live-set", args: { tempo: 128 } },
        ],
      },
    });

    await handleGeminiMessage(message, deps);

    expect(executeTool).toHaveBeenCalledWith("ppal-update-live-set", {
      tempo: 128,
    });
    expect(sendToolResponse).toHaveBeenCalledWith({
      functionResponses: [
        {
          id: "c1",
          name: "ppal-update-live-set",
          response: { output: "Tempo updated." },
        },
      ],
    });
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(true);
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(false);
  });

  it("falls back to the tool name as id when none is provided", async () => {
    const { deps, sendToolResponse } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ name: "ppal-x" }] } }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toStrictEqual({
      arguments: "{}",
      itemId: "ppal-x",
      output: "tool-output",
      status: "completed",
      type: "function_call",
      name: "ppal-x",
    });
    expect(sendToolResponse).toHaveBeenCalled();
  });

  it("tolerates a function call with no name (empty-string fallbacks)", async () => {
    const executeTool = vi.fn(async () => "ok");
    const { deps, sendToolResponse } = makeMessageDeps({ executeTool });

    await handleGeminiMessage(msg({ toolCall: { functionCalls: [{}] } }), deps);

    expect(executeTool).toHaveBeenCalledWith("", {});
    expect(sendToolResponse).toHaveBeenCalled();
  });

  it("surfaces a sendToolResponse failure via setError", async () => {
    const { deps } = makeMessageDeps({
      getSession: () =>
        ({
          sendToolResponse: () => {
            throw new Error("socket closed");
          },
        }) as unknown as Session,
    });

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ id: "c", name: "ppal-x" }] } }),
      deps,
    );

    expect(deps.setError).toHaveBeenCalledWith("socket closed");
  });

  it("skips sendToolResponse when the session is gone", async () => {
    const { deps } = makeMessageDeps({ getSession: () => null });

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ id: "c", name: "ppal-x" }] } }),
      deps,
    );

    // No throw; thinking still toggled off.
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(false);
  });
});
