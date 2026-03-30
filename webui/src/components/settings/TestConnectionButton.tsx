// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "preact/hooks";
import { type Provider } from "#webui/types/settings";
import { testConnection } from "#webui/utils/test-connection";

type Status = "idle" | "testing" | "success" | "error";

const AUTO_CLEAR_MS = 5000;

interface TestConnectionButtonProps {
  provider: Provider;
  apiKey: string;
  baseUrl?: string | null;
}

/**
 * Button that tests the AI provider connection and shows inline feedback.
 * @param props - Component props
 * @param props.provider - Current provider
 * @param props.apiKey - API key for the provider
 * @param props.baseUrl - Base URL for custom/local providers
 * @returns Test connection button element
 */
export function TestConnectionButton({
  provider,
  apiKey,
  baseUrl,
}: TestConnectionButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleTest = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("testing");
    setMessage(null);

    void testConnection(provider, apiKey, baseUrl ?? undefined).then(
      (result) => {
        setStatus(result.ok ? "success" : "error");
        setMessage(result.message);
        const timer = setTimeout(() => {
          setStatus("idle");
          setMessage(null);
        }, AUTO_CLEAR_MS);

        timerRef.current = timer;
      },
    );
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleTest}
        disabled={status === "testing"}
        className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50"
        data-testid="test-connection-button"
      >
        {status === "testing" ? "Testing\u2026" : "Test Connection"}
      </button>
      {message && (
        <span
          className={`text-sm ${status === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          data-testid="test-connection-message"
        >
          {message}
        </span>
      )}
    </div>
  );
}
