import { render, screen } from '@testing-library/react-native';

import { Logo } from './Logo';

describe('Logo', () => {
  it('is an image announced by its accessible name', async () => {
    await render(<Logo accessibilityLabel="Just Calorie" />);

    expect(screen.getByRole('image', { name: 'Just Calorie' })).toBeOnTheScreen();
  });
});
