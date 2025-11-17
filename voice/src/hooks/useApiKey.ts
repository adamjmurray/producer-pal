import { useState, useEffect } from 'react';

const API_KEY_STORAGE_KEY = 'gemini_api_key';

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string>('');

  useEffect(() => {
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);

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
