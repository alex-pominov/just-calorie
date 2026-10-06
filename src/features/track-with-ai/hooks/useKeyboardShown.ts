import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** Whether the keyboard is up, turning as it starts to move, the moment KeyboardAvoidingView starts moving the input row. */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(() => Keyboard.isVisible());

  useEffect(() => {
    const showing = Keyboard.addListener('keyboardWillShow', () => setShown(true));
    const hiding = Keyboard.addListener('keyboardWillHide', () => setShown(false));

    return () => {
      showing.remove();
      hiding.remove();
    };
  }, []);

  return shown;
}
