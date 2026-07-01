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
import { ScreenIdError } from "../recipes/render/types";
import {
	DEFAULT_MODEL_NAME,
	DeviceProfile,
	getDeviceProfile,
} from "../trmnl/device-profile";
import { Device, DeviceDisplayMode, FormatValue, PseudoDevice } from "../types";
import { configuredTimezone } from "../utils";
import {
	convertExtensionToMimeType,
	DefaultImageMimeType,
	getImageFilenameExtensionFromMimeType,
	SupportedMimeTypes,
} from "./device-image-url";
import {
	AssociationPreview,
	AssociationRenderSettings,
	FunctionGetPreviewScreenArgs,
	RenderAssociationType,
	RenderAssociationValues,
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
	width,
	height,
	modelName,
	paletteId,
	orientation,
	format,
}: ResolvePreviewImageUrlParameters): Promise<string> {
	"use server";
	const noDb = isNoDbMode();

	const userId = !noDb ? await getCurrentUserId() : null;

	if (!noDb && !userId) {
		throw Error("Current user could not be determined.");
	}

	const associationValues = await createRenderAssociationValuesForSettings({
		type: RenderAssociationType.recipePreview,
		screenId,
		renderSettings: {
			width,
			height,
			modelName,
			paletteId,
			orientation,
			mimeType: convertFormatToMimeType(format),
		},
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

	const { device, playlistScreens, renderSettings } = values;
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
					renderSettings,
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
			renderSettings,
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
		renderSettings,
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
	renderSettings,
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

	const mimeType =
		profile.model.mime_type ?? renderSettings?.mimeType ?? DefaultImageMimeType;

	const extension = getImageFilenameExtensionFromMimeType(mimeType);

	const imageUrl = `/api/bitmap/${associationId}.${extension}`;

	const associationValues: RenderAssociationValues = {
		associationId,
		type,
		imageUrl,
		screenId,
		renderSettings: {
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

	const mimeType =
		renderSettings.mimeType ?? profile.model.mime_type ?? DefaultImageMimeType;

	const extension = getImageFilenameExtensionFromMimeType(mimeType);

	const imageUrl = `/api/bitmap/${associationId}.${extension}`;

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
			//
			$timezone: null,
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

const PseudoDeviceId = -1;

const getPseudoPreviewDevice = ({
	userId,
	modelName,
	paletteId,
	$timezone,
}: {
	userId: string;
	modelName: string | null;
	paletteId: string | null;
	$timezone: string | null;
}): Device => {
	const result: PseudoDevice = {
		id: PseudoDeviceId,
		name: "PseudoPreviewDevice",
		friendly_id: "pseudo-preview-device",
		user_id: userId,
		model: modelName,
		palette_id: paletteId,
		timezone: $timezone ?? configuredTimezone(),
	};
	return result as Device;
};
