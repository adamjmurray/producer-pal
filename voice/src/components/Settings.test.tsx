import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';

describe('Settings', () => {
  beforeEach(() => {
    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });
  it('renders settings page with API key input', () => {
    const onSave = vi.fn();
    const onBack = vi.fn();

    render(<Settings apiKey="" onSave={onSave} onBack={onBack} />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByLabelText(/google gemini api key/i)).toBeInTheDocument();
  });

  it('displays existing API key', () => {
    const onSave = vi.fn();
    const onBack = vi.fn();

    render(<Settings apiKey="existing-key-123" onSave={onSave} onBack={onBack} />);

    const input = screen.getByLabelText(/google gemini api key/i);
    expect(input).toHaveValue('existing-key-123');
  });

  it('calls onSave when save button is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onBack = vi.fn();

    render(<Settings apiKey="" onSave={onSave} onBack={onBack} />);

    const input = screen.getByLabelText(/google gemini api key/i);
    await user.type(input, 'new-api-key');

    const saveButton = screen.getByRole('button', { name: /save api key/i });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('new-api-key');
  });

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onBack = vi.fn();

    render(<Settings apiKey="" onSave={onSave} onBack={onBack} />);

    const backButton = screen.getByRole('button', { name: /back to chat/i });
    await user.click(backButton);

    expect(onBack).toHaveBeenCalled();
  });

  it('always uses password input type', () => {
    const onSave = vi.fn();
    const onBack = vi.fn();

    render(<Settings apiKey="secret-key" onSave={onSave} onBack={onBack} />);

    const input = screen.getByLabelText(
      /google gemini api key/i
    ) as HTMLInputElement;

    expect(input.type).toBe('password');
  });

  it('disables save button when input is empty', () => {
    const onSave = vi.fn();
    const onBack = vi.fn();

    render(<Settings apiKey="" onSave={onSave} onBack={onBack} />);

    const saveButton = screen.getByRole('button', { name: /save api key/i });
    expect(saveButton).toBeDisabled();
  });

  it('renders link to Gemini API keys', () => {
    const onSave = vi.fn();
    const onBack = vi.fn();

    render(<Settings apiKey="" onSave={onSave} onBack={onBack} />);

    const link = screen.getByRole('link', { name: /gemini api keys/i });
    expect(link).toHaveAttribute(
      'href',
      'https://aistudio.google.com/app/apikey'
    );
  });
});
