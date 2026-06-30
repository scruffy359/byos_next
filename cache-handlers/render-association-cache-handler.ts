import { env } from "node:process";
import Valkey from "iovalkey";
import { RenderAssociationValues } from "@/lib/render/render-association-types";

const ExpireMinutes = 10;
const ExpireSeconds = 60 * ExpireMinutes;

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

const getAssociationKey = (associationId: string) => {
	return `render-${associationId}`;
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
