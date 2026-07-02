import { DeviceProfile } from "../trmnl/device-profile";
import { Device } from "../types";
import { SupportedMimeTypes } from "./device-image-url";

export type ResolvePreviewImageUrlParameters = {
	screenId: string;
	renderHints: RenderHints | null;
};

export type ResolvePreviewImageUrlType = (
	params: ResolvePreviewImageUrlParameters,
) => Promise<string>;

export type PlaylistScreenArray = { screen: string; duration: number }[];

/**
 * Rendering hints for the association.
 * NOTE: width and height are always supplied in the device's "landscape"
 * orientation.
 */
export type RenderHints = {
	/** An override to the model's width. */
	width: number | null;
	/** An override to the model's height. */
	height: number | null;
	/** The device model. */
	modelName: string | null;
	/** The device's palette identifier. */
	paletteId: string | null;
	/** Override to the model's orientation. */
	orientation: string | null; // why not considered in bitmap logic?
	/** Mime Type of output. */
	mimeType: SupportedMimeTypes | null;
};

type RequiredNotNull<T> = {
	[P in keyof T]: NonNullable<T[P]>;
};

/**
 * Same as `RenderHints`, but all values are required to
 * by non-null and the width/height are returned with orientation will
 * rotate original width/height if orientation is "portrait".
 */
export type ResolvedRenderHints = RequiredNotNull<RenderHints> & {
	profile: DeviceProfile;
};

export type FunctionGetPreviewScreenArgs = {
	device: Device;
	playlistScreens: PlaylistScreenArray;
	renderHints: RenderHints;
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
	renderHints: RenderHints;
	/** Information about the device when type is "display" or "device-preview" */
	device?: {
		id: number;
		apiKey: string;
	};
	recipePreview?: AssociationPreview;
	/** Snapshot of the data parameters at the time of request. */
	dataParams: Record<string, unknown> | null;
};
