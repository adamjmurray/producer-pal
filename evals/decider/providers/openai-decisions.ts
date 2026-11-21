// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Translates a decider call to and from OpenAI's Decisions API
 * (`POST /v1/decisions`), which asks the same kinds of question in another shape.
 */

import {
  type DeciderAnswer,
  type DeciderQuestion,
  type DeciderResponse,
} from "../decider-client.ts";

interface OpenaiPredicateAnswer {
  type: "predicate";
  name: string;
  probability: number;
}

interface OpenaiScoreAnswer {
  type: "score";
  name: string;
  score: number;
  confidence: number;
  probabilities: { value: number; label: string; probability: number }[];
}

interface OpenaiOtherAnswer {
  type: "choice" | "refusal";
  name: string;
}

type OpenaiAnswer =
  | OpenaiPredicateAnswer
  | OpenaiScoreAnswer
  | OpenaiOtherAnswer;

export interface OpenaiDecisionsResponse {
  model?: string;
  answers: OpenaiAnswer[];
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Build the Decisions request body for a decider call.
 *
 * @param model - The model to ask
 * @param state - What the questions are about
 * @param questions - Questions by id
 * @returns The request body
 */
export function toOpenaiDecisionsRequest(
  model: string,
  state: unknown,
  questions: Record<string, DeciderQuestion>,
): Record<string, unknown> {
  return {
    model,
    input: stateText(state),
    questions: Object.entries(questions).map(([name, q]) =>
      q.type === "score"
        ? {
            type: "score",
            name,
            instructions: q.instructions,
            // The level's meaning is in the description; the label is its index
            levels: q.criteria.map((description, i) => ({
              label: String(i),
              description,
            })),
          }
        : { type: "predicate", name, instructions: predicateText(q) },
    ),
  };
}

/**
 * Turn a Decisions response into the decider's answer shape.
 *
 * @param response - The Decisions response body
 * @param model - The model asked, used when the response names none
 * @returns Answers by question id, plus token usage
 * @throws When the model refused a question
 */
export function fromOpenaiDecisionsResponse(
  response: OpenaiDecisionsResponse,
  model: string,
): DeciderResponse {
  const answers: Record<string, DeciderAnswer> = {};

  for (const answer of response.answers) {
    if (answer.type === "predicate") {
      answers[answer.name] = { type: "noul", noul: answer.probability };
    } else if (answer.type === "score") {
      answers[answer.name] = {
        type: "score",
        score: answer.score,
        confidence: answer.confidence,
        legend: Object.fromEntries(
          answer.probabilities.map((p) => [String(p.value), p.label]),
        ),
        probabilities: Object.fromEntries(
          answer.probabilities.map((p) => [String(p.value), p.probability]),
        ),
      };
    } else if (answer.type === "refusal") {
      throw new Error(`Decider refused question "${answer.name}"`);
    }
  }

  return {
    model: response.model ?? model,
    answers,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

/**
 * Write the state as plain text: an object of strings becomes titled sections,
 * so a transcript keeps its line breaks.
 *
 * @param state - A string, an object of strings, or anything else
 * @returns The text to send as input
 */
function stateText(state: unknown): string {
  if (typeof state === "string") {
    return state;
  }

  if (state != null && typeof state === "object" && !Array.isArray(state)) {
    const entries = Object.entries(state);

    if (entries.every(([, value]) => typeof value === "string")) {
      return entries
        .map(([key, value]) => `## ${key}\n\n${String(value)}`)
        .join("\n\n");
    }
  }

  return JSON.stringify(state);
}

/**
 * A yes/no question's text, with what yes and no mean when it says.
 *
 * @param question - The yes/no question
 * @returns The instructions to send
 */
function predicateText(
  question: Extract<DeciderQuestion, { type: "noul" }>,
): string {
  const { instructions, criteria } = question;

  return criteria == null
    ? instructions
    : `${instructions}\n\nYes means: ${criteria.true}\nNo means: ${criteria.false}`;
}
