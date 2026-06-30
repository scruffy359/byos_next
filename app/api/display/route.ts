import {
	getNewAssociationId,
	setCurrentScreenCacheEntry,
	setRenderAssociationCacheEntry,
} from "@/cache-handlers/render-association-cache-handler";
import { db } from "@/lib/database/db";
import { withExplicitUserScope } from "@/lib/database/scoped-db";
import { checkDbConnection } from "@/lib/database/utils";
import {
	DISPLAY_FALLBACK_REFRESH_SECONDS,
	normalizeRefreshSchedule,
} from "@/lib/device/defaults";
import { selectDisplayForDevice } from "@/lib/display/select";
import { getLatestFirmware, isUpdateAvailable } from "@/lib/firmware";
import { logError, logInfo } from "@/lib/logger";
import { DeviceDisplayMode } from "@/lib/mixup/constants";
import {
	buildDeviceImageFilename,
	buildDeviceImageUrl,
} from "@/lib/render/device-image-url";
import {
	RenderAssociationType,
	RenderAssociationValues,
} from "@/lib/render/render-association-types";
import { configuredTimezone } from "@/lib/utils";
import {
	buildClaimResponse,
	buildDisplayResponse,
	buildErrorResponse,
	calculateRefreshRate,
	findOrCreateDevice,
	getActivePlaylistItem,
	parseRequestHeaders,
	precacheImageInBackground,
	updateDeviceStatus,
} from "./utils";

export const DEFAULT_REFRESH_RATE = DISPLAY_FALLBACK_REFRESH_SECONDS;

export async function GET(request: Request) {
	const headers = parseRequestHeaders(request);
	const baseUrl = `${headers.hostUrl}/api/bitmap`;
	const uniqueId = getNewAssociationId();

	if (!headers.apiKey) {
		return buildErrorResponse(
			"Access-Token header is required",
			baseUrl,
			uniqueId,
			401,
		);
	}

	const { ready } = await checkDbConnection();

	if (!ready) {
		logError("Database not available for display request", {
			source: "api/display",
		});
		return buildErrorResponse("Database not available", baseUrl, uniqueId, 503);
	}

	logInfo("Display API Request", {
		source: "api/display",
		metadata: { apiKey: headers.apiKey?.slice(0, 6) },
	});

	try {
		const lookup = await findOrCreateDevice(headers);
		const { device } = lookup;

		if (!device) {
			if (lookup.claimCode) {
				logInfo("Returning pending device claim code", {
					source: "api/display",
					metadata: {
						apiKey: headers.apiKey?.slice(0, 6),
						macAddress: headers.macAddress,
					},
				});
				return buildClaimResponse(lookup.claimCode, baseUrl, uniqueId);
			}
			logError("Error fetching/creating device", {
				source: "api/display",
				metadata: { apiKey: headers.apiKey?.slice(0, 6) },
			});
			return buildErrorResponse("Device not found", baseUrl, uniqueId);
		}
		const timezone = device.timezone || configuredTimezone();

		const selection = await selectDisplayForDevice(device, {
			hostUrl: headers.hostUrl,
			renderAssociationId: uniqueId,
			width: headers.width,
			height: headers.height,
			base64: headers.base64,
		});

		let errorMessage: string | null = null;

		let { screen: screenToDisplay, imageUrlAssociated: imageUrl } = selection;
		let dynamicRefreshRate: number;

		const { display_mode: displayMode, mixup_id: mixupId } = device;

		switch (displayMode) {
			case DeviceDisplayMode.PLAYLIST: {
				if (device.playlist_id) {
					const activeItem = await getActivePlaylistItem(
						device.playlist_id,
						device.current_playlist_index || 0,
						timezone,
						device.user_id,
					);

					if (activeItem) {
						screenToDisplay = activeItem.screen_id;
						dynamicRefreshRate = activeItem.duration;
						const updatePlaylistIndex = (scopedDb: typeof db) =>
							scopedDb
								.updateTable("devices")
								.set({ current_playlist_index: activeItem.order_index })
								.where("id", "=", device.id.toString())
								.execute();
						if (device.user_id) {
							await withExplicitUserScope(device.user_id, updatePlaylistIndex);
						} else {
							await updatePlaylistIndex(db);
						}
					} else {
						logInfo("No active playlist item found", {
							source: "api/display",
							metadata: { deviceId: device.friendly_id },
						});
						screenToDisplay = "error";
						errorMessage = "No active playlist item";
						/*
						imageUrl = buildDeviceImageUrl({
							baseUrl,
							imagePath: "error",
							profile: selection.profile,
							/*
							query: errorImageQuery(
								selection.baseQueryParams,
								"No active playlist item",
							),*/ /*
						});*/
						dynamicRefreshRate = DEFAULT_REFRESH_RATE;
					}
				} else {
					screenToDisplay = "error";
					errorMessage = "Playlist mode needs a playlist";
					/*
					imageUrl = buildDeviceImageUrl({
						baseUrl,
						imagePath: "error",
						profile: selection.profile,
						/*
						query: errorImageQuery(
							selection.baseQueryParams,
							"Playlist mode needs a playlist",
						),*/ /*
					});*/
					dynamicRefreshRate = DEFAULT_REFRESH_RATE;
				}
				/* not needed?
				if (screenToDisplay !== "error") {
					imageUrl = buildDeviceImageUrl({
						baseUrl,
						imagePath: screenToDisplay,
						profile: selection.profile,
						query: selection.baseQueryParams,
					});
				}*/
				break;
			}

			case DeviceDisplayMode.MIXUP:
				if (mixupId) {
					// override computed imageUrl for mixup
					const mixupPath = `mixup/${mixupId}`;
					screenToDisplay = mixupPath;
					imageUrl = buildDeviceImageUrl({
						baseUrl,
						imagePath: `mixup/${getNewAssociationId()}`,
						profile: selection.profile,
						/* TODO
						query: `${selection.baseQueryParams}&access_token=${encodeURIComponent(
							headers.apiKey,
						)}`,*/
					});
					logInfo("Using mixup display mode", {
						source: "api/display",
						metadata: {
							deviceId: device.friendly_id,
							mixupId,
						},
					});
				}
				dynamicRefreshRate = calculateRefreshRate(
					normalizeRefreshSchedule(device.refresh_schedule),
					DEFAULT_REFRESH_RATE,
					device.timezone || configuredTimezone(),
				);
				break;

			default:
				dynamicRefreshRate = calculateRefreshRate(
					normalizeRefreshSchedule(device.refresh_schedule),
					DEFAULT_REFRESH_RATE,
					device.timezone || configuredTimezone(),
				);
				break;
		}

		// TODO: lookup the parameters and add to association values

		const associationValues: RenderAssociationValues = {
			associationId: uniqueId,
			type: RenderAssociationType.display,
			imageUrl,
			screenId: screenToDisplay,
			renderSettings: {
				modelName: device.model,
				paletteId: device.palette_id,
				orientation: device.screen_orientation ?? "landscape",
			},
			device: {
				id: device.id,
				apiKey: device.api_key,
			},
			dataParams: errorMessage
				? {
						errorMessage,
					}
				: null,
		};

		// associate the uniqueId with screen and device
		setRenderAssociationCacheEntry(associationValues);

		// save this as the device's current screen
		setCurrentScreenCacheEntry(device.friendly_id, associationValues);

		precacheImageInBackground(imageUrl, device.friendly_id);
		updateDeviceStatus(device, headers, dynamicRefreshRate);

		logInfo("Display request successful", {
			source: "api/display",
			metadata: {
				deviceId: device.friendly_id,
				screen: screenToDisplay,
				refreshRate: dynamicRefreshRate,
				displayMode: device.display_mode,
			},
		});

		const orientation = device.screen_orientation || "landscape";
		const firmwareExtra: Record<string, unknown> = {
			// 0 = portrait (no rotation), 1 = landscape (90° rotation).
			image_rotate: orientation === "landscape" ? 1 : 0,
			// Display tuning profile. Firmware reads this only when it sent
			// `temperature-profile: true` in the request.
			temperature_profile: device.temperature_profile ?? "default",
		};

		const latestFirmware = await getLatestFirmware();
		if (
			latestFirmware &&
			isUpdateAvailable(device.firmware_version, latestFirmware.version)
		) {
			firmwareExtra.update_firmware = true;
			firmwareExtra.firmware_url = latestFirmware.downloadUrl;
			logInfo("Firmware update available", {
				source: "api/display",
				metadata: {
					deviceId: device.friendly_id,
					currentVersion: device.firmware_version,
					latestVersion: latestFirmware.version,
				},
			});
		}

		return buildDisplayResponse(
			imageUrl,
			buildDeviceImageFilename(screenToDisplay, uniqueId, selection.profile),
			dynamicRefreshRate,
			firmwareExtra,
		);
	} catch (error) {
		logError(error instanceof Error ? error : new Error(String(error)), {
			source: "api/display",
			metadata: {
				apiKey: headers.apiKey?.slice(0, 6),
				reportedModel: headers.model,
				uniqueId,
			},
		});
		return buildErrorResponse("Internal server error", baseUrl, uniqueId);
	}
}
