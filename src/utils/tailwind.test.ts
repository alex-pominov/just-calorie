import { cn } from './tailwind';

describe('cn', () => {
  it('lets the later of two conflicting utilities win', () => {
    const className = cn('px-2 py-1', 'px-4');

    expect(className).toBe('py-1 px-4');
  });

  it('drops falsy values and keeps the truthy keys of a condition object', () => {
    const className = cn('flex-1', false, null, undefined, { hidden: false, 'items-center': true });

    expect(className).toBe('flex-1 items-center');
  });

  it('keeps a design font size beside a text colour', () => {
    const className = cn('text-label', 'text-primary');

    expect(className).toBe('text-label text-primary');
  });

  it('lets the later of two design font sizes win', () => {
    const className = cn('text-label text-coral', 'text-body');

    expect(className).toBe('text-coral text-body');
  });
});
