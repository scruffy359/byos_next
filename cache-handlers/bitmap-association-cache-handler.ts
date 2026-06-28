import { env } from "node:process";
import Valkey from "iovalkey";
import { ScreenIdError } from "@/lib/recipes/render/types";
import { buildDeviceImageUrl } from "@/lib/render/device-image-url";
import {
	DEFAULT_MODEL_NAME,
	getDeviceProfile,
} from "@/lib/trmnl/device-profile";
import { Device } from "@/lib/types";

const ExpireMinutes = 10;
export const ExpireSeconds = 60 * ExpireMinutes;

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			KEYVALUE_PORT: string;
			KEYVALUE_PASSWORD: string;
			KEYVALUE_DATABASE: string;
		}
	}
}

// TODO: support noDB mode, use in-memory cache (only for recipe testing).

const port = parseInt(env.KEYVALUE_PORT, 10);
const database = parseInt(env.KEYVALUE_DATABASE, 10);
const password = env.KEYVALUE_PASSWORD;
const bitmapAssociationCache = new Valkey(port, { password, db: database });

export enum RenderAssociationType {
	display = "display",
	recipePreview = "recipe-preview",
	devicePreview = "device-preview",
}

export type AssociationRenderSettings = {
	// TODO: width & height?
	modelName: string | null;
	paletteId: string | null;
	orientation: string; // why not considered in bitmap logic?
};

type AssociationPreview = {
	/** The user requesting the preview from the UI. Will be `null` when in noDB mode.*/
	userId: string | null;
};

const getAssociationKey = (associationId: string) => {
	return `render-${associationId}`;
};

// TODO: persist parameters, allowing /api/display/current to show data at that point in time.
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

export const createErrorRenderAssociationValuesForDevice = async ({
	type,
	device,
	errorMessage,
}: {
	type: RenderAssociationType;
	device: Device;
	errorMessage: string;
}) => {
	return createRenderAssociationValuesForDevice({
		type,
		device,
		screenId: ScreenIdError,
		dataParams: {
			errorMessage,
		},
	});
};

export const createRenderAssociationValuesForDevice = async ({
	type,
	device,
	screenId,
	recipePreview,
	dataParams,
}: {
	type: RenderAssociationType;
	screenId: string;
	device: Device;
	recipePreview?: AssociationPreview;
	dataParams: Record<string, unknown> | null;
}) => {
	if (type === RenderAssociationType.recipePreview && !recipePreview) {
		throw new Error("Association value missing 'recipePreview'");
	}
	const associationId = getNewAssociationId();

	const modelName = device.model ?? DEFAULT_MODEL_NAME;
	const paletteId = device.palette_id;

	const profile = await getDeviceProfile(modelName, paletteId);

	const imageUrl = buildDeviceImageUrl({
		baseUrl: `/api/bitmap`,
		imagePath: `${associationId}`,
		profile,
	});

	const associationValues: RenderAssociationValues = {
		associationId,
		type,
		imageUrl,
		screenId: screenId,
		renderSettings: {
			modelName,
			paletteId,
			orientation: device.screen_orientation ?? "landscape",
		},
		device: {
			id: device.id,
			apiKey: device.api_key,
		},
		dataParams,
	};

	return associationValues;
};

export const createRenderAssociationValuesForSettings = async ({
	type,
	screenId,
	renderSettings,
	recipePreview,
	dataParams,
}: {
	type: RenderAssociationType;
	screenId: string;
	renderSettings: Required<AssociationRenderSettings>;
	recipePreview?: AssociationPreview;
	dataParams: Record<string, unknown> | null;
}) => {
	if (type === RenderAssociationType.recipePreview && !recipePreview) {
		throw new Error("Association value missing 'recipePreview'");
	}

	const associationId = getNewAssociationId();

	const profile = await getDeviceProfile(
		renderSettings.modelName,
		renderSettings.paletteId,
	);

	const imageUrl = buildDeviceImageUrl({
		baseUrl: `/api/bitmap`,
		imagePath: `${associationId}`,
		profile,
	});

	const associationValues: RenderAssociationValues = {
		associationId,
		type,
		imageUrl,
		screenId: screenId,
		renderSettings,
		recipePreview,
		dataParams,
	};

	return associationValues;
};

/**
 * Returns a new associationId for calls to `setBitmapAssociationCacheEntry`.
 * @returns Unique association identifier.
 */
export const getNewAssociationId = () => {
	const uniqueId =
		Math.random().toString(36).substring(2, 7) +
		Date.now().toString(36).slice(-3);
	return uniqueId;
};

/**
 * Create an bitmap association cache entry which maps the `bitmapAssociationId` to
 * the Device and request Screen.
 * @param values values for cache entry
 */
export const setRenderAssociationCacheEntry = (
	values: RenderAssociationValues,
) => {
	const { associationId: bitmapAssociationId } = values;
	const cacheKey = getAssociationKey(bitmapAssociationId);
	const cacheValue = values;
	bitmapAssociationCache.set(
		cacheKey,
		JSON.stringify(cacheValue),
		"EX",
		ExpireSeconds,
	);

	console.log("Created render association", { cacheKey, cacheValue });
};

export const getRenderAssociatedCacheEntry = async (
	associationId: string,
): Promise<RenderAssociationValues | null> => {
	const cacheKey = getAssociationKey(associationId);
	const value = await bitmapAssociationCache.get(cacheKey);

	if (!value) {
		return null;
	}

	const object = JSON.parse(value);
	return object;
};

const getCurrentScreenKey = (deviceFriendlyName: string) => {
	return `current-screen-${deviceFriendlyName}`;
};

/**
 * Create an bitmap association cache entry which maps the `bitmapAssociationId` to
 * the Device and request Screen.
 * @param param0
 */
export const setCurrentScreenCacheEntry = (
	deviceFriendlyName: string,
	values: RenderAssociationValues,
) => {
	const cacheKey = getCurrentScreenKey(deviceFriendlyName);
	const cacheValue = values;
	bitmapAssociationCache.set(cacheKey, JSON.stringify(cacheValue));

	console.log("Assigned current screen", { cacheKey, cacheValue });
};

export const getCurrentScreenCacheEntry = async (
	deviceFriendlyName: string,
): Promise<RenderAssociationValues | null> => {
	const cacheKey = getCurrentScreenKey(deviceFriendlyName);
	const value = await bitmapAssociationCache.get(cacheKey);

	if (!value) {
		return null;
	}

	const object = JSON.parse(value);
	return object;
};
