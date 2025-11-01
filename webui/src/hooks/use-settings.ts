import { useCallback, useEffect, useState } from "preact/hooks";
import type { UseSettingsReturn } from "../types/settings.js";

export function useSettings(): UseSettingsReturn {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [thinking, setThinking] = useState("Auto");
  const [temperature, setTemperature] = useState(1.0);
  const [showThoughts, setShowThoughts] = useState(true);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setApiKey(savedKey);
    }
    const savedModel = localStorage.getItem("gemini_model");
    if (savedModel) {
      setModel(savedModel);
    }
    const savedThinking = localStorage.getItem("gemini_thinking");
    if (savedThinking) {
      setThinking(savedThinking);
    }
    const savedTemperature = localStorage.getItem("gemini_temperature");
    if (savedTemperature != null) {
      setTemperature(parseFloat(savedTemperature));
    }
    const savedShowThoughts = localStorage.getItem("gemini_showThoughts");
    if (savedShowThoughts != null) {
      setShowThoughts(savedShowThoughts === "true");
    }
  }, []);

  const saveSettings = useCallback(() => {
    localStorage.setItem("gemini_api_key", apiKey);
    localStorage.setItem("gemini_model", model);
    localStorage.setItem("gemini_thinking", thinking);
    localStorage.setItem("gemini_temperature", temperature.toString());
    localStorage.setItem("gemini_showThoughts", showThoughts.toString());
  }, [apiKey, model, thinking, temperature, showThoughts]);

  const cancelSettings = useCallback(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setApiKey(savedKey);
    }
    const savedModel = localStorage.getItem("gemini_model");
    if (savedModel) {
      setModel(savedModel);
    }
    const savedThinking = localStorage.getItem("gemini_thinking");
    if (savedThinking) {
      setThinking(savedThinking);
    }
    const savedTemperature = localStorage.getItem("gemini_temperature");
    if (savedTemperature != null) {
      setTemperature(parseFloat(savedTemperature));
    }
    const savedShowThoughts = localStorage.getItem("gemini_showThoughts");
    if (savedShowThoughts != null) {
      setShowThoughts(savedShowThoughts === "true");
    }
  }, []);

  const hasApiKey = !!localStorage.getItem("gemini_api_key");

  return {
    apiKey,
    setApiKey,
    model,
    setModel,
    thinking,
    setThinking,
    temperature,
    setTemperature,
    showThoughts,
    setShowThoughts,
    saveSettings,
    cancelSettings,
    hasApiKey,
  };
}
