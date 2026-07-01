import { Device, FormatValue } from "../types";
import { SupportedMimeTypes } from "./device-image-url";

export type ResolvePreviewImageUrlParameters = {
	screenId: string;
	width: number | null;
	height: number | null;
	modelName: string | null;
	paletteId: string | null;
	orientation: string | null;
	format: FormatValue;
};

export type ResolvePreviewImageUrlType = (
	params: ResolvePreviewImageUrlParameters,
) => Promise<string>;

export type PlaylistScreenArray = { screen: string; duration: number }[];

export type AssociationRenderSettings = {
	width: number | null;
	height: number | null;
	modelName: string | null;
	paletteId: string | null;
	orientation: string | null; // why not considered in bitmap logic?
	mimeType: SupportedMimeTypes | null;
};

export type FunctionGetPreviewScreenArgs = {
	device: Device;
	playlistScreens: PlaylistScreenArray;
	renderSettings: AssociationRenderSettings;
};

export type FunctionGetPreviewScreenUrls = (
	values: FunctionGetPreviewScreenArgs,
) => Promise<string[]>;

export enum RenderAssociationType {
	display = "display",
	recipePreview = "recipe-preview",
	devicePreview = "device-preview",
}

export type AssociationPreview = {
	/** The user requesting the preview from the UI. Will be `null` when in noDB mode.*/
	userId: string | null;
};

// TODO: fix /api/display/current to know the actually current screen. Need another cache (FRIENDLY_ID -> ASSOCIATION_ID)
export type RenderAssociationValues = {
	associationId: string;
	type: RenderAssociationType;
	imageUrl: string;
	screenId: string;
	renderSettings: AssociationRenderSettings;
	/** Information about the device when type is "display" or "device-preview" */
	device?: {
		id: number;
		apiKey: string;
	};
	recipePreview?: AssociationPreview;
	/** Snapshot of the data parameters at the time of request. */
	dataParams: Record<string, unknown> | null;
};
