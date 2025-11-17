import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceChat } from './VoiceChat';

// Mock useVoiceChat hook
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockStartRecording = vi.fn();
const mockStopRecording = vi.fn();
const mockSetVerboseLogging = vi.fn();

let mockHookReturn: {
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
  transcription: string;
  debug: string;
  verboseLogging: boolean;
  setVerboseLogging: typeof mockSetVerboseLogging;
  connect: typeof mockConnect;
  disconnect: typeof mockDisconnect;
  startStreaming: typeof mockStartRecording;
  stopStreaming: typeof mockStopRecording;
} = {
  isConnected: false,
  isStreaming: false,
  error: null,
  transcription: '',
  debug: '',
  verboseLogging: false,
  setVerboseLogging: mockSetVerboseLogging,
  connect: mockConnect,
  disconnect: mockDisconnect,
  startStreaming: mockStartRecording,
  stopStreaming: mockStopRecording,
};

vi.mock('../hooks/useVoiceChat', () => ({
  useVoiceChat: vi.fn(() => mockHookReturn),
}));

describe('VoiceChat', () => {
  const mockOnOpenSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default state
    mockHookReturn = {
      isConnected: false,
      isStreaming: false,
      error: null,
      transcription: '',
      debug: '',
      verboseLogging: false,
      setVerboseLogging: mockSetVerboseLogging,
      connect: mockConnect,
      disconnect: mockDisconnect,
      startStreaming: mockStartRecording,
      stopStreaming: mockStopRecording,
    };
  });

  it('should show API key required message when no API key', () => {
    render(<VoiceChat apiKey="" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.getByText('API Key Required')).toBeInTheDocument();
    expect(screen.getByText(/Please configure your Gemini API key/)).toBeInTheDocument();
  });

  it('should have a settings button in the header', () => {
    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    const settingsButton = screen.getByRole('button', { name: /settings/i });
    expect(settingsButton).toBeInTheDocument();
  });

  it('should call onOpenSettings when settings button clicked', async () => {
    const user = userEvent.setup();
    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await user.click(settingsButton);

    expect(mockOnOpenSettings).toHaveBeenCalled();
  });

  it('should have a connect button when not connected', () => {
    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
  });

  it('should call connect when connect button clicked', async () => {
    const user = userEvent.setup();
    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    const connectButton = screen.getByRole('button', { name: /connect/i });
    await user.click(connectButton);

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalled();
    });
  });

  it('should show start conversation button when connected', () => {
    mockHookReturn = {
      ...mockHookReturn,
      isConnected: true,
    };

    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.getByRole('button', { name: /start conversation/i })).toBeInTheDocument();
  });

  it('should call startStreaming when start button clicked', async () => {
    mockHookReturn = {
      ...mockHookReturn,
      isConnected: true,
    };

    const user = userEvent.setup();
    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    const startButton = screen.getByRole('button', { name: /start conversation/i });
    await user.click(startButton);

    await waitFor(() => {
      expect(mockStartRecording).toHaveBeenCalled();
    });
  });

  it('should display error message when there is an error', () => {
    mockHookReturn = {
      ...mockHookReturn,
      error: 'Connection failed',
    };

    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.getByText(/Error:/)).toBeInTheDocument();
    expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
  });

  it('should display transcription when available', () => {
    mockHookReturn = {
      ...mockHookReturn,
      isConnected: true,
      transcription: 'Hello, how can I help you?',
    };

    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.getByText(/Hello, how can I help you?/)).toBeInTheDocument();
  });

  it('should show streaming indicator when streaming', () => {
    mockHookReturn = {
      ...mockHookReturn,
      isConnected: true,
      isStreaming: true,
    };

    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.getByText(/conversation active/i)).toBeInTheDocument();
  });

  it('should have verbose logging checkbox', () => {
    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    const checkbox = screen.getByRole('checkbox', { name: /enable verbose logging/i });
    expect(checkbox).toBeInTheDocument();
  });

  it('should have verbose logging checkbox unchecked by default', () => {
    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    const checkbox = screen.getByRole('checkbox', { name: /enable verbose logging/i });
    expect(checkbox).not.toBeChecked();
  });

  it('should call setVerboseLogging when checkbox is clicked', async () => {
    const user = userEvent.setup();
    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    const checkbox = screen.getByRole('checkbox', { name: /enable verbose logging/i });
    await user.click(checkbox);

    expect(mockSetVerboseLogging).toHaveBeenCalledWith(true);
  });

  it('should not show debug pane when verbose logging is disabled', () => {
    mockHookReturn = {
      ...mockHookReturn,
      verboseLogging: false,
      debug: 'Some debug info',
    };

    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.queryByText(/debug info:/i)).not.toBeInTheDocument();
  });

  it('should show debug pane when verbose logging is enabled and debug has content', () => {
    mockHookReturn = {
      ...mockHookReturn,
      verboseLogging: true,
      debug: 'Some debug info',
    };

    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.getByText(/debug info:/i)).toBeInTheDocument();
    expect(screen.getByText(/some debug info/i)).toBeInTheDocument();
  });

  it('should not show debug pane when verbose logging is enabled but debug is empty', () => {
    mockHookReturn = {
      ...mockHookReturn,
      verboseLogging: true,
      debug: '',
    };

    render(<VoiceChat apiKey="test-key" onOpenSettings={mockOnOpenSettings} />);

    expect(screen.queryByText(/debug info:/i)).not.toBeInTheDocument();
  });
});
