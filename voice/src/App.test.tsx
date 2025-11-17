import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock VoiceChat component
vi.mock('./components/VoiceChat', () => ({
  VoiceChat: ({ onOpenSettings }: { onOpenSettings: () => void }) => (
    <div>
      <h2>Voice Chat Mock</h2>
      <button onClick={onOpenSettings}>Settings</button>
    </div>
  ),
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('renders voice chat interface by default', () => {
    render(<App />);
    expect(screen.getByText(/voice chat mock/i)).toBeInTheDocument();
  });

  it('does not show mode toggle buttons', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /text chat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /voice chat/i })).not.toBeInTheDocument();
  });

  it('navigates to settings when settings button is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await user.click(settingsButton);

    expect(screen.getByText(/google gemini api key/i)).toBeInTheDocument();
  });

  it('navigates back to voice chat from settings', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Go to settings
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await user.click(settingsButton);

    // Go back to voice chat
    const backButton = screen.getByRole('button', { name: /back/i });
    await user.click(backButton);

    expect(screen.getByText(/voice chat mock/i)).toBeInTheDocument();
  });
});
