import { env } from "node:process";
import Valkey from "iovalkey";

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
const port = parseInt(env.KEYVALUE_PORT, 10);
const database = parseInt(env.KEYVALUE_DATABASE, 10);
const password = env.KEYVALUE_PASSWORD;
const bitmapAssociationCache = new Valkey(port, { password, db: database });

const getKey = (associationId: string) => {
	return `bitmap-${associationId}`;
};

export enum BitmapAssociationType {
	display = "display",
	preview = "preview",
}

// TODO: persist parameters, allowing /api/display/current to show data at that point in time.
// TODO: fix /api/display/current to know the actually current screen. Need another cache (FRIENDLY_ID -> ASSOCIATION_ID)
export type BitmapAssociationValues = {
	bitmapAssociationId: string;
	type: BitmapAssociationType;
	imageUrl: string;
	screenId: string;
	device?: {
		id: number;
		apiKey: string;
		modelName: string | null;
		paletteId: string | null;
	};
	preview?: {
		/** The user requesting the preview from the UI. */
		userId: string;
		modelName: string;
		paletteId: string | null;
		orientation: string; // why not considered in bitmap logic?
		params?: Record<string, unknown>; // TODO: not needed because we have userid
	};
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
 * @param param0
 */
export const setBitmapAssociationCacheEntry = (
	values: BitmapAssociationValues,
) => {
	const { bitmapAssociationId } = values;
	const cacheKey = getKey(bitmapAssociationId);
	const cacheValue = values;
	bitmapAssociationCache.set(
		cacheKey,
		JSON.stringify(cacheValue),
		"EX",
		ExpireSeconds,
	);

	console.log("Created bitmap association", { cacheKey, cacheValue });
};

export const getBitmapAssociatedCacheEntry = async (
	associationId: string,
): Promise<BitmapAssociationValues | null> => {
	const cacheKey = getKey(associationId);
	const value = await bitmapAssociationCache.get(cacheKey);

	if (!value) {
		return null;
	}

	const object = JSON.parse(value);
	return object;
};
