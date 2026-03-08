declare const __APP_VERSION__: string;
declare const __APP_DISPLAY_VERSION__: string;

declare interface Window {
	atlasDesktop?: {
		savePanorama?: (payload: unknown) => Promise<unknown>;
		readPanorama?: (filePath: string) => Promise<unknown>;
		pickPanorama?: () => Promise<unknown>;
		deletePanorama?: (filePath: string) => Promise<unknown>;
		listWorldPresets?: () => Promise<unknown>;
		readWorldPreset?: (id: string) => Promise<unknown>;
		saveWorldPreset?: (name: string, config: unknown) => Promise<unknown>;
		deleteWorldPreset?: (id: string) => Promise<unknown>;
		scanMusicFolders?: () => Promise<unknown>;
	};
}
