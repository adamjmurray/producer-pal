import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiKey } from './useApiKey';

describe('useApiKey', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with empty API key', () => {
    const { result } = renderHook(() => useApiKey());
    expect(result.current.apiKey).toBe('');
    expect(result.current.hasApiKey).toBe(false);
  });

  it('loads API key from localStorage on mount', () => {
    localStorage.setItem('gemini_api_key', 'test-key-123');
    const { result } = renderHook(() => useApiKey());
    expect(result.current.apiKey).toBe('test-key-123');
    expect(result.current.hasApiKey).toBe(true);
  });

  it('saves API key to localStorage', () => {
    const { result } = renderHook(() => useApiKey());

    act(() => {
      result.current.saveApiKey('new-key-456');
    });

    expect(result.current.apiKey).toBe('new-key-456');
    expect(localStorage.getItem('gemini_api_key')).toBe('new-key-456');
    expect(result.current.hasApiKey).toBe(true);
  });

  it('clears API key from localStorage', () => {
    localStorage.setItem('gemini_api_key', 'test-key-123');
    const { result } = renderHook(() => useApiKey());

    act(() => {
      result.current.clearApiKey();
    });

    expect(result.current.apiKey).toBe('');
    expect(localStorage.getItem('gemini_api_key')).toBeNull();
    expect(result.current.hasApiKey).toBe(false);
  });

  it('removes API key when saving empty string', () => {
    localStorage.setItem('gemini_api_key', 'test-key-123');
    const { result } = renderHook(() => useApiKey());

    act(() => {
      result.current.saveApiKey('');
    });

    expect(result.current.apiKey).toBe('');
    expect(localStorage.getItem('gemini_api_key')).toBeNull();
    expect(result.current.hasApiKey).toBe(false);
  });
});
