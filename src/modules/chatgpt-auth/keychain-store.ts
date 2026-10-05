import * as SecureStore from 'expo-secure-store';

/** The three keychain calls the session needs, so a test can hand over an in-memory store. */
export interface SecretStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** The signed-in account's tokens. */
export const SESSION_KEY = 'chatgpt.session';

/** This install's opaque host id, which OpenAI's plan-usage flow asks for. Not a credential, so sign-out keeps it. */
export const HOST_ID_KEY = 'chatgpt.host-id';

// Readable only while the phone is unlocked, and never restored onto another device from a backup.
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** The iOS Keychain, through expo-secure-store. The only place a ChatGPT token is ever written. */
export const keychainStore: SecretStore = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS),
};
