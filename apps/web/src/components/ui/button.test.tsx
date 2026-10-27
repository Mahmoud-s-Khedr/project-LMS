import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('is accessible and supports user interaction', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue learning</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Continue learning' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
