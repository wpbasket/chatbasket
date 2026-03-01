// Reexport the native module. On web, it will be resolved to SaveToDeviceModule.web.ts
// and on native platforms to SaveToDeviceModule.ts
export * from './src/SaveToDevice.types';
export { default } from './src/SaveToDeviceModule';
export type { FileExistsResult, FileInfo, SaveCompleteEvent, SaveResult } from './src/SaveToDeviceModule';

