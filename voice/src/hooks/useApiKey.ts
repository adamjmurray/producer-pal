import { useState } from 'react';

const API_KEY_STORAGE_KEY = 'gemini_api_key';

/**
 * Hook for managing Gemini API key in localStorage
 * @returns {object} API key management functions and state
 */
export function useApiKey() {
  const [apiKey, setApiKey] = useState<string>(() => {
    // Lazy initialization from localStorage
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    return storedKey ?? '';
  });

  const saveApiKey = (key: string) => {
    setApiKey(key);
    if (key) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  };

  const clearApiKey = () => {
    setApiKey('');
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  };

  return {
    apiKey,
    saveApiKey,
    clearApiKey,
    hasApiKey: apiKey.length > 0,
  };
}
