// TODO: split cache integration for association data manipulation methods
import { env } from "node:process";
import Valkey from "iovalkey";
import { fetchDeviceByApiKey } from "@/app/actions/device";
import {
	AssociationRenderSettings,
	ScreenIdError,
} from "@/lib/recipes/render/types";
import { buildDeviceImageUrl } from "@/lib/render/device-image-url";
import {
	DEFAULT_MODEL_NAME,
	DeviceProfile,
	getDeviceProfile,
} from "@/lib/trmnl/device-profile";
import { Device } from "@/lib/types";
import { configuredTimezone } from "@/lib/utils";

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

type AssociationPreview = {
	/** The user requesting the preview from the UI. Will be `null` when in noDB mode.*/
	userId: string | null;
};

const getAssociationKey = (associationId: string) => {
	return `render-${associationId}`;
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
		renderSettings: null,
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
	renderSettings: AssociationRenderSettings | null;
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
		screenId,
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

type PseudoDevice = Pick<
	Device,
	| "id"
	| "name"
	| "friendly_id"
	| "user_id"
	| "timezone"
	| "model"
	| "palette_id"
>;

const getPseudoPreviewDevice = ({
	userId,
	modelName,
	paletteId,
}: {
	userId: string;
	modelName: string | null;
	paletteId: string | null;
}): Device => {
	const result: PseudoDevice = {
		id: 0,
		name: "PseudoPreviewDevice",
		friendly_id: "pseudo-preview-device",
		user_id: userId,
		model: modelName,
		palette_id: paletteId,
		// TODO: lookup up user's timezone
		timezone: configuredTimezone(),
	};
	return result as Device;
};

export async function resolveAssociationData(
	associatedValues: RenderAssociationValues,
): Promise<{
	userId: string;
	device: Device;
	internalValues: {
		$timezone: string;
	};
} | null> {
	const {
		type: associationType,
		device: associationDevice,
		renderSettings,
		recipePreview: preview,
	} = associatedValues;

	if (associationType === RenderAssociationType.recipePreview) {
		// preview path
		if (!preview) {
			throw new Error("Render association entry missing 'reviewPreview'");
		}

		const { userId } = preview;
		const { modelName, paletteId } = renderSettings;

		if (!userId) {
			throw new Error("Render association preview missing user ID.");
		}

		// create Pseudo Preview Device
		const previewDevice = getPseudoPreviewDevice({
			userId,
			modelName,
			paletteId,
		});
		return {
			userId,
			device: previewDevice,
			internalValues: {
				$timezone: configuredTimezone(),
			},
		};
	}

	if (!associationDevice) {
		throw new Error("Render association entry missing 'device'");
	}

	const device = await fetchDeviceByApiKey(associationDevice.apiKey, {
		assumeDbReady: true,
	});

	if (!device) {
		console.error("Device not found with apiKey.");
		return null;
	}

	if (!device.user_id) {
		console.error("Device is not assigned a user ID.");
		return null;
	}

	return {
		userId: device.user_id,
		device,
		internalValues: {
			$timezone: device.timezone,
		},
	};
}

export async function resolveDeviceProfile(
	device: Device,
): Promise<DeviceProfile> {
	// assumes we've been passed a real device or a psuedo device.
	const modelName = device?.model ?? DEFAULT_MODEL_NAME;
	const paletteId = device?.palette_id ?? null;

	return getDeviceProfile(modelName, paletteId);
}
