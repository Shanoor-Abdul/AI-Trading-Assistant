import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type ScreenFrame = {
  timestamp: number;
  base64: string;
  mimeType: "image/jpeg";
};

type NativeScreenCaptureModule = {
  start: (intervalSeconds: number) => Promise<boolean>;
  stop: () => Promise<void>;
  isRunning: () => Promise<boolean>;
};

const nativeModule = NativeModules.MobileScreenCapture as NativeScreenCaptureModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(NativeModules.MobileScreenCapture) : null;

export const screenCapture = {
  isAvailable: Platform.OS === "android" && Boolean(nativeModule),

  start: async (intervalSeconds = 15) => {
    if (!nativeModule) throw new Error("Native Android screen capture module is unavailable.");
    return nativeModule.start(intervalSeconds);
  },

  stop: async () => {
    await nativeModule?.stop();
  },

  isRunning: async () => Boolean(await nativeModule?.isRunning()),

  subscribe: (listener: (frame: ScreenFrame) => void) => {
    if (!emitter) return () => undefined;
    const subscription = emitter.addListener("MobileScreenFrame", listener);
    return () => subscription.remove();
  },
};
