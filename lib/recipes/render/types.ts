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
