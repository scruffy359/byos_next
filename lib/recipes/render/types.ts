import { Device } from "@/lib/types";

export const ScreenIdError = "error";
export const ScreenIdNotFound = "not-found";

export type ResolvePreviewImageUrlParameters = {
	screenId: string;
	modelName: string;
	paletteId: string | null;
	orientation: string;
};

export type ResolvePreviewImageUrlType = (
	params: ResolvePreviewImageUrlParameters,
) => Promise<string>;

export type PlaylistScreenArray = { screen: string; duration: number }[];

export type AssociationRenderSettings = {
	// TODO: width & height?
	modelName: string | null;
	paletteId: string | null;
	orientation: string | null; // why not considered in bitmap logic?
};

export type FunctionGetPreviewScreenArgs = {
	device: Device;
	playlistScreens: PlaylistScreenArray;
	renderSettings: AssociationRenderSettings;
};

export type FunctionGetPreviewScreenUrls = (
	values: FunctionGetPreviewScreenArgs,
) => Promise<string[]>;
