// Reexport the native module. On web, it will be resolved to ChatbasketDownloadsModule.web.ts
// and on native platforms to ChatbasketDownloadsModule.ts
export { default } from './src/ChatbasketDownloadsModule';
export type { SaveResult, FileExistsResult, FileInfo, SaveCompleteEvent } from './src/ChatbasketDownloadsModule';
export * from './src/ChatbasketDownloads.types';
