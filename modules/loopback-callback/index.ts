import { requireOptionalNativeModule } from 'expo';

export interface LoopbackStartOptions {
  readonly state: string;
  readonly preferredPort: number;
  readonly timeoutMs: number;
}

/** The native listener in `ios/`. Results are parsed by the caller; every rejection carries an `ERR_LOOPBACK_*` `code`. */
export interface LoopbackCallbackNativeModule {
  start(options: LoopbackStartOptions): Promise<unknown>;
  waitForCallback(sessionId: number): Promise<unknown>;
  stop(sessionId: number): Promise<void>;
}

/** Null in a build without the module, such as Expo Go or Jest. */
export const loopbackCallbackNative = requireOptionalNativeModule<LoopbackCallbackNativeModule>('LoopbackCallback');
