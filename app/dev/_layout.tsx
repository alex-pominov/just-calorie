import { Redirect, Slot } from 'expo-router';

// Development tools (the component sheet, the state seed). A release build sends any link here to the main screen.
export default function DevLayout() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <Slot />;
}
