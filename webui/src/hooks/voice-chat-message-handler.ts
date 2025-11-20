/**
 * Message handling logic for voice chat
 */

import type { LiveServerMessage } from "@google/genai";
import type { RefObject } from "preact";
import type { Dispatch, StateUpdater } from "preact/hooks";
import type { UIMessage } from "../types/messages.js";

/**
 * Handles user transcription updates
 * @param text - User transcription text
 * @param currentUserMessageRef - Ref to current user message content
 * @param setMessages - State setter for messages
 * @returns {void}
 */
export function handleUserTranscription(
  text: string,
  currentUserMessageRef: RefObject<string>,
  setMessages: Dispatch<StateUpdater<UIMessage[]>>,
): void {
  currentUserMessageRef.current = (currentUserMessageRef.current ?? "") + text;

  // Create or update user message
  setMessages((prev) => {
    const updated = [...prev];
    const lastMessage = updated[updated.length - 1];

    if (lastMessage?.role === "user") {
      // Update existing user message
      lastMessage.parts = [
        {
          type: "text",
          content: currentUserMessageRef.current ?? "",
        },
      ];
    } else {
      // Create new user message
      updated.push({
        role: "user",
        parts: [
          {
            type: "text",
            content: currentUserMessageRef.current ?? "",
          },
        ],
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
 * @returns {void}
 */
export function handleAssistantTranscription(
  text: string,
  currentAssistantMessageRef: RefObject<string>,
  setMessages: Dispatch<StateUpdater<UIMessage[]>>,
): void {
  currentAssistantMessageRef.current =
    (currentAssistantMessageRef.current ?? "") + text;

  // Create or update assistant message
  setMessages((prev) => {
    const updated = [...prev];
    const lastMessage = updated[updated.length - 1];

    if (lastMessage?.role === "model") {
      // Update existing assistant message
      const existingTextPartIndex = lastMessage.parts.findIndex(
        (p) => p.type === "text",
      );

      if (existingTextPartIndex >= 0) {
        // Update existing text part
        lastMessage.parts[existingTextPartIndex] = {
          type: "text",
          content: currentAssistantMessageRef.current ?? "",
        };
      } else {
        // Add new text part (after tool calls)
        lastMessage.parts.push({
          type: "text",
          content: currentAssistantMessageRef.current ?? "",
        });
      }
    } else {
      // Create new assistant message
      updated.push({
        role: "model",
        parts: [
          {
            type: "text",
            content: currentAssistantMessageRef.current ?? "",
          },
        ],
        rawHistoryIndex: updated.length,
      });
    }

    return updated;
  });
}

/**
 * Handles interruptions by clearing audio queue
 * @param currentAudioSourceRef - Ref to current audio source
 * @param nextPlayTimeRef - Ref to next play time
 * @returns {void}
 */
export function handleInterruption(
  currentAudioSourceRef: RefObject<AudioBufferSourceNode | null>,
  nextPlayTimeRef: RefObject<number>,
): void {
  console.log("AI interrupted - clearing audio queue");
  if (currentAudioSourceRef.current) {
    currentAudioSourceRef.current.stop();
    currentAudioSourceRef.current = null;
  }
  nextPlayTimeRef.current = 0;
}

/**
 * Handles turn complete by resetting current message refs
 * @param currentUserMessageRef - Ref to current user message content
 * @param currentAssistantMessageRef - Ref to current assistant message content
 * @returns {void}
 */
export function handleTurnComplete(
  currentUserMessageRef: RefObject<string>,
  currentAssistantMessageRef: RefObject<string>,
): void {
  currentUserMessageRef.current = "";
  currentAssistantMessageRef.current = "";
}

/**
 * Creates a message handler for voice chat
 * @param refs - Object containing all necessary refs
 * @param refs.currentAudioSourceRef - Ref to current audio source
 * @param refs.nextPlayTimeRef - Ref to next play time
 * @param refs.currentUserMessageRef - Ref to current user message content
 * @param refs.currentAssistantMessageRef - Ref to current assistant message content
 * @param callbacks - Object containing callback functions
 * @param callbacks.setMessages - State setter for messages
 * @param callbacks.handleToolCall - Callback for handling tool calls
 * @param callbacks.playAudioChunk - Callback for playing audio chunks
 * @returns {Function} Message handler function
 */
export function createMessageHandler(
  refs: {
    currentAudioSourceRef: RefObject<AudioBufferSourceNode | null>;
    nextPlayTimeRef: RefObject<number>;
    currentUserMessageRef: RefObject<string>;
    currentAssistantMessageRef: RefObject<string>;
  },
  callbacks: {
    setMessages: Dispatch<StateUpdater<UIMessage[]>>;
    handleToolCall: (toolCall: unknown) => void;
    playAudioChunk: (data: string) => void;
  },
): (message: LiveServerMessage) => void {
  return (message: LiveServerMessage) => {
    try {
      // Handle interruptions
      if (message.serverContent?.interrupted) {
        handleInterruption(refs.currentAudioSourceRef, refs.nextPlayTimeRef);
        return;
      }

      // Handle transcriptions
      if (message.serverContent?.inputTranscription?.text) {
        const text = message.serverContent.inputTranscription.text;
        console.log(`User transcription: ${text}`);
        handleUserTranscription(
          text,
          refs.currentUserMessageRef,
          callbacks.setMessages,
        );
      }

      if (message.serverContent?.outputTranscription?.text) {
        const text = message.serverContent.outputTranscription.text;
        console.log(`AI transcription: ${text}`);
        handleAssistantTranscription(
          text,
          refs.currentAssistantMessageRef,
          callbacks.setMessages,
        );
      }

      // Handle tool calls
      if (message.toolCall) {
        console.log(`Tool call received:`, message.toolCall);
        callbacks.handleToolCall(message.toolCall);
        return;
      }

      // Handle audio
      const turn = message.serverContent?.modelTurn;
      if (turn?.parts) {
        for (const part of turn.parts) {
          if ("inlineData" in part && part.inlineData?.data) {
            callbacks.playAudioChunk(part.inlineData.data);
          }
        }
      }

      // Handle turn complete - reset current message refs
      if (message.serverContent?.turnComplete) {
        handleTurnComplete(
          refs.currentUserMessageRef,
          refs.currentAssistantMessageRef,
        );
      }
    } catch (err) {
      console.error("Message handler error:", err);
    }
  };
}
