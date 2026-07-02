"use server";

import { fetchDeviceByApiKey } from "@/app/actions/device";
import {
	getCurrentScreenCacheEntry,
	getNewAssociationId,
	getRenderAssociatedCacheEntry,
	setRenderAssociationCacheEntry,
} from "@/cache-handlers/render-association-cache-handler";
import { getCurrentUserId } from "../auth/get-user";
import { isNoDbMode } from "../database/utils";
import {
	DEFAULT_IMAGE_HEIGHT,
	DEFAULT_IMAGE_WIDTH,
} from "../recipes/constants";
import { ScreenIdError } from "../recipes/render/types";
import {
	DEFAULT_MODEL_NAME,
	DeviceProfile,
	getDeviceProfile,
} from "../trmnl/device-profile";
import { Device, DeviceDisplayMode, FormatValue } from "../types";
import { configuredTimezone } from "../utils";
import {
	convertExtensionToMimeType,
	DefaultImageMimeType,
	getImageFilenameExtensionFromMimeType,
	SupportedMimeTypes,
} from "./device-image-url";
import {
	AssociationPreview,
	FunctionGetPreviewScreenArgs,
	RenderAssociationType,
	RenderAssociationValues,
	RenderHints,
	ResolvedRenderHints,
	ResolvePreviewImageUrlParameters,
} from "./render-association-types";

export const getCurrentScreenAssociation = async (
	device: Device,
): Promise<RenderAssociationValues> => {
	const associationValues = await getCurrentScreenCacheEntry(
		device.friendly_id,
	);

	if (!associationValues) {
		const errorAssociationValues =
			await createErrorRenderAssociationValuesForDevice({
				type: RenderAssociationType.devicePreview,
				device,
				errorMessage: "Cannot display latest screen for device.",
			});

		setRenderAssociationCacheEntry(errorAssociationValues);

		return errorAssociationValues;
	}

	// ensure render cache entry exists
	const existingRenderValues = await getRenderAssociatedCacheEntry(
		associationValues.associationId,
	);

	// if not existings, set cache entry as it likely aged out.
	if (!existingRenderValues) {
		setRenderAssociationCacheEntry(associationValues);
	}

	return associationValues;
};

const convertFormatToMimeType = (format: FormatValue | null) => {
	if (!format || format === FormatValue.react) {
		return null; // should never really get here
	}
	return convertExtensionToMimeType(format);
};

export async function getRecipePreviewImageUrl({
	screenId,
	renderHints,
}: ResolvePreviewImageUrlParameters): Promise<string> {
	"use server";
	const noDb = isNoDbMode();

	const userId = !noDb ? await getCurrentUserId() : null;

	if (!noDb && !userId) {
		throw Error("Current user could not be determined.");
	}

	const updatedRenderHints: RenderHints = {
		width: renderHints?.width ?? null,
		height: renderHints?.height ?? null,
		modelName: renderHints?.modelName ?? null,
		paletteId: renderHints?.paletteId ?? null,
		orientation: renderHints?.orientation ?? null,
		mimeType: renderHints?.mimeType ?? DefaultImageMimeType,
	};

	//TODO convertFormatToMimeType(format);
	const associationValues = await createRenderAssociationValuesForSettings({
		type: RenderAssociationType.recipePreview,
		screenId,
		renderHints: updatedRenderHints,
		recipePreview: {
			userId,
		},
		dataParams: null,
	});

	setRenderAssociationCacheEntry(associationValues);

	return associationValues.imageUrl;
}

export const getDevicePreviewScreenUrls = async (
	values: FunctionGetPreviewScreenArgs,
): Promise<string[]> => {
	"use server";

	const noDb = isNoDbMode();

	const userId = !noDb ? await getCurrentUserId() : null;

	if (!noDb && !userId) {
		throw Error("Current user could not be determined.");
	}

	const { device, playlistScreens, renderHints } = values;
	const isPlaylist = device.display_mode === DeviceDisplayMode.PLAYLIST;
	const isMixup = device.display_mode === DeviceDisplayMode.MIXUP;

	if (isPlaylist) {
		if (!device.playlist_id) {
			const errorAssociationValues =
				await createErrorRenderAssociationValuesForDevice({
					type: RenderAssociationType.devicePreview,
					device,
					errorMessage: "Device's playlist is not set",
				});

			setRenderAssociationCacheEntry(errorAssociationValues);

			return [errorAssociationValues.imageUrl];
		}

		return Promise.all(
			playlistScreens.map(async (playlistScreen) => {
				if (!playlistScreen.screen) {
					const errorAssociationValues =
						await createErrorRenderAssociationValuesForDevice({
							type: RenderAssociationType.devicePreview,
							device,
							errorMessage: "Playlist item has no screen",
						});

					setRenderAssociationCacheEntry(errorAssociationValues);

					return errorAssociationValues.imageUrl;
				}
				const associationValues = await createRenderAssociationValuesForDevice({
					type: RenderAssociationType.devicePreview,
					screenId: playlistScreen.screen,
					device,
					renderHints,
					recipePreview: {
						userId,
					},
					dataParams: null,
				});

				setRenderAssociationCacheEntry(associationValues);

				return associationValues.imageUrl;
			}),
		);
	}

	if (isMixup) {
		if (!device.mixup_id) {
			const errorAssociationValues =
				await createErrorRenderAssociationValuesForDevice({
					type: RenderAssociationType.devicePreview,
					device,
					errorMessage: "Device's mixup is not set",
				});

			setRenderAssociationCacheEntry(errorAssociationValues);

			return [errorAssociationValues.imageUrl];
		}
		const associationValues = await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.recipePreview,
			screenId: `mixup/${device.mixup_id}`,
			device,
			renderHints,
			recipePreview: {
				userId,
			},
			dataParams: null,
		});

		setRenderAssociationCacheEntry(associationValues);

		return [associationValues.imageUrl];
	}

	if (!device.screen) {
		const errorAssociationValues =
			await createErrorRenderAssociationValuesForDevice({
				type: RenderAssociationType.devicePreview,
				device,
				errorMessage: "Device screen is not configured",
			});

		setRenderAssociationCacheEntry(errorAssociationValues);

		return [errorAssociationValues.imageUrl];
	}

	const associationValues = await createRenderAssociationValuesForDevice({
		type: RenderAssociationType.recipePreview,
		screenId: device.screen,
		device,
		renderHints,
		recipePreview: {
			userId,
		},
		dataParams: null,
	});

	setRenderAssociationCacheEntry(associationValues);

	return [associationValues.imageUrl];
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
		renderHints: null,
		dataParams: {
			errorMessage,
		},
	});
};

export const createRenderAssociationValuesForDevice = async ({
	type,
	device,
	screenId,
	renderHints,
	recipePreview,
	dataParams,
}: {
	type: RenderAssociationType;
	screenId: string;
	device: Device;
	renderHints: RenderHints | null;
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

	const mimeType =
		profile.model.mime_type ?? renderHints?.mimeType ?? DefaultImageMimeType;

	const extension = getImageFilenameExtensionFromMimeType(mimeType);

	const imageUrl = `/api/bitmap/${associationId}.${extension}`;

	const associationValues: RenderAssociationValues = {
		associationId,
		type,
		imageUrl,
		screenId,
		renderHints: {
			width: null, // TODO
			height: null, // TODO
			modelName,
			paletteId,
			orientation: device.screen_orientation ?? "landscape",
			mimeType: mimeType as SupportedMimeTypes,
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
	renderHints,
	recipePreview,
	dataParams,
}: {
	type: RenderAssociationType;
	screenId: string;
	renderHints: Required<RenderHints>;
	recipePreview?: AssociationPreview;
	dataParams: Record<string, unknown> | null;
}) => {
	if (type === RenderAssociationType.recipePreview && !recipePreview) {
		throw new Error("Association value missing 'recipePreview'");
	}

	const associationId = getNewAssociationId();

	const profile = await getDeviceProfile(
		renderHints.modelName,
		renderHints.paletteId,
	);

	const mimeType =
		renderHints.mimeType ?? profile.model.mime_type ?? DefaultImageMimeType;

	const extension = getImageFilenameExtensionFromMimeType(mimeType);

	const imageUrl = `/api/bitmap/${associationId}.${extension}`;

	const associationValues: RenderAssociationValues = {
		associationId,
		type,
		imageUrl,
		screenId: screenId,
		renderHints,
		recipePreview,
		dataParams,
	};

	return associationValues;
};

type ResolvedAssociationValues = {
	userId: string;
	device: Device | null;
	renderHints: ResolvedRenderHints;
	renderDataValues: {
		$timezone: string;
	};
};

export async function resolveAssociationValues(
	associatedValues: RenderAssociationValues,
): Promise<ResolvedAssociationValues> {
	const {
		type: associationType,
		device: associationDevice,
		renderHints,
		recipePreview: preview,
	} = associatedValues;

	if (associationType === RenderAssociationType.recipePreview) {
		// preview path
		if (!preview) {
			throw new Error("Render association entry missing 'reviewPreview'");
		}

		const { userId } = preview;

		if (!userId) {
			throw new Error("Render association preview missing user ID.");
		}

		// create Pseudo Preview Device
		const resolvedRenderHints = await getResolvedRenderHints({
			renderHints,
			device: null,
		});

		return {
			userId,
			device: null,
			renderHints: resolvedRenderHints,
			renderDataValues: {
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
		throw new Error("Device not found with apiKey.");
	}

	if (!device.user_id) {
		throw new Error("Device is not assigned a user ID.");
	}

	const resolvedRenderHints = await getResolvedRenderHints({
		renderHints,
		device,
	});

	return {
		userId: device.user_id,
		device,
		renderHints: resolvedRenderHints,
		renderDataValues: {
			$timezone: device.timezone ?? configuredTimezone(),
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

export const getDefaultRenderHints = async (): Promise<ResolvedRenderHints> => {
	return getResolvedRenderHints({
		renderHints: {
			width: null,
			height: null,
			modelName: DEFAULT_MODEL_NAME,
			paletteId: null,
			orientation: "landscape",
			mimeType: DefaultImageMimeType,
		},
		device: null,
	});
};

const getResolvedRenderHints = async ({
	renderHints,
	device,
}: {
	renderHints: RenderHints;
	device: Device | null;
}): Promise<ResolvedRenderHints> => {
	const resolvedModelName = renderHints.mimeType ?? DEFAULT_MODEL_NAME;
	const resolvedPaletteId = renderHints.paletteId;

	const profile = await getDeviceProfile(resolvedModelName, resolvedPaletteId);

	return {
		width:
			renderHints.width ??
			device?.screen_width ??
			profile.model.width ??
			DEFAULT_IMAGE_WIDTH,
		height:
			renderHints.height ??
			device?.screen_height ??
			profile.model.height ??
			DEFAULT_IMAGE_HEIGHT,
		modelName: resolvedModelName,
		paletteId: resolvedPaletteId ?? "", // TODO allow null?
		orientation:
			renderHints.orientation ?? device?.screen_orientation ?? "landscape",
		mimeType: renderHints.mimeType ?? DefaultImageMimeType,
		profile,
	};
};
