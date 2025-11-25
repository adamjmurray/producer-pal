/**
 * Message handling logic for voice chat
 */

import type { LiveServerMessage } from "@google/genai";
import type { RefObject } from "preact";
import type { Dispatch, StateUpdater } from "preact/hooks";
import type { UIMessage } from "../types/messages";
import type { AudioStreamer } from "./audio-streamer";

const DEBUG = localStorage.getItem("voice-debug") === "true";

function log(...args: unknown[]): void {
  if (DEBUG)
    console.log("[MessageHandler]", performance.now().toFixed(1), ...args);
}

/**
 * Handles user transcription updates
 * @param text - User transcription text
 * @param currentUserMessageRef - Ref to current user message content
 * @param setMessages - State setter for messages
 */
export function handleUserTranscription(
  text: string,
  currentUserMessageRef: RefObject<string>,
  setMessages: Dispatch<StateUpdater<UIMessage[]>>,
): void {
  currentUserMessageRef.current = (currentUserMessageRef.current ?? "") + text;

  setMessages((prev) => {
    const updated = [...prev];
    const lastMessage = updated[updated.length - 1];

    if (lastMessage?.role === "user") {
      lastMessage.parts = [
        { type: "text", content: currentUserMessageRef.current ?? "" },
      ];
    } else {
      updated.push({
        role: "user",
        parts: [{ type: "text", content: currentUserMessageRef.current ?? "" }],
        rawHistoryIndex: updated.length,
      });
    }

    return updated;
  });
}

/**
 * Handles assistant transcription updates
 * @param text - Assistant transcription text
 * @param currentAssistantMessageRef - Ref to current assistant message content
 * @param setMessages - State setter for messages
 */
export function handleAssistantTranscription(
  text: string,
  currentAssistantMessageRef: RefObject<string>,
  setMessages: Dispatch<StateUpdater<UIMessage[]>>,
): void {
  currentAssistantMessageRef.current =
    (currentAssistantMessageRef.current ?? "") + text;

  setMessages((prev) => {
    const updated = [...prev];
    const lastMessage = updated[updated.length - 1];

    if (lastMessage?.role === "model") {
      const existingTextPartIndex = lastMessage.parts.findIndex(
        (p) => p.type === "text",
      );

      if (existingTextPartIndex >= 0) {
        lastMessage.parts[existingTextPartIndex] = {
          type: "text",
          content: currentAssistantMessageRef.current ?? "",
        };
      } else {
        lastMessage.parts.push({
          type: "text",
          content: currentAssistantMessageRef.current ?? "",
        });
      }
    } else {
      updated.push({
        role: "model",
        parts: [
          { type: "text", content: currentAssistantMessageRef.current ?? "" },
        ],
        rawHistoryIndex: updated.length,
      });
    }

    return updated;
  });
}

/**
 * Handles interruptions by stopping and resuming the audio streamer.
 * This clears the queue and prepares for new audio.
 * @param streamer - AudioStreamer instance to interrupt
 */
export function handleInterruption(streamer: AudioStreamer | null): void {
  log("Handling interruption");
  if (streamer) {
    streamer.stop();
    void streamer.resume();
  }
}

/**
 * Handles turn complete by resetting current message refs
 * @param currentUserMessageRef - Ref to current user message content
 * @param currentAssistantMessageRef - Ref to current assistant message content
 */
export function handleTurnComplete(
  currentUserMessageRef: RefObject<string>,
  currentAssistantMessageRef: RefObject<string>,
): void {
  currentUserMessageRef.current = "";
  currentAssistantMessageRef.current = "";
}

export interface MessageHandlerRefs {
  currentUserMessageRef: RefObject<string>;
  currentAssistantMessageRef: RefObject<string>;
  streamerRef: RefObject<AudioStreamer | null>;
}

export interface MessageHandlerCallbacks {
  setMessages: Dispatch<StateUpdater<UIMessage[]>>;
  handleToolCall: (toolCall: unknown) => void;
}

/**
 * Handles audio parts from a model turn
 * @param parts - Parts array from model turn
 * @param streamer - AudioStreamer to send audio to
 */
function handleAudioParts(
  parts: Array<{ inlineData?: { data?: string } }>,
  streamer: AudioStreamer | null,
): void {
  for (const part of parts) {
    if ("inlineData" in part && part.inlineData?.data) {
      streamer?.addPCM16(part.inlineData.data);
    }
  }
}

/**
 * Creates a message handler for voice chat that uses AudioStreamer for playback
 * @param refs - Refs for message state and audio streamer
 * @param callbacks - Callbacks for state updates and tool handling
 * @returns {Function} Message handler function for LiveServerMessage events
 */
export function createMessageHandler(
  refs: MessageHandlerRefs,
  callbacks: MessageHandlerCallbacks,
): (message: LiveServerMessage) => void {
  return (message: LiveServerMessage) => {
    try {
      const serverContent = message.serverContent;

      // Handle interruptions
      if (serverContent?.interrupted) {
        log("Interrupted");
        handleInterruption(refs.streamerRef.current);
        return;
      }

      // Handle tool calls
      if (message.toolCall) {
        log("Tool call:", message.toolCall);
        callbacks.handleToolCall(message.toolCall);
        return;
      }

      // Handle user transcription
      const userText = serverContent?.inputTranscription?.text;
      if (userText) {
        log("User transcription:", userText);
        handleUserTranscription(
          userText,
          refs.currentUserMessageRef,
          callbacks.setMessages,
        );
      }

      // Handle AI transcription
      const aiText = serverContent?.outputTranscription?.text;
      if (aiText) {
        log("AI transcription:", aiText);
        handleAssistantTranscription(
          aiText,
          refs.currentAssistantMessageRef,
          callbacks.setMessages,
        );
      }

      // Handle audio from model turn
      const turnParts = serverContent?.modelTurn?.parts;
      if (turnParts) {
        handleAudioParts(turnParts, refs.streamerRef.current);
      }

      // Handle turn complete
      if (serverContent?.turnComplete) {
        log("Turn complete");
        handleTurnComplete(
          refs.currentUserMessageRef,
          refs.currentAssistantMessageRef,
        );
        refs.streamerRef.current?.complete();
      }
    } catch (err) {
      console.error("Message handler error:", err);
    }
  };
}
