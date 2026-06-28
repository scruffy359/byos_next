export type ResolvePreviewImageUrlParameters = {
	screenId: string;
	modelName: string;
	paletteId: string | null;
	orientation: string;
};

export type ResolvePreviewImageUrlType = (
	params: ResolvePreviewImageUrlParameters,
) => Promise<string>;
