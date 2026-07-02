import { fetchDeviceByApiKey } from "@/app/actions/device";
import {
	getCurrentScreenCacheEntry,
	getNewAssociationId,
	getRenderAssociatedCacheEntry,
	setRenderAssociationCacheEntry,
} from "@/cache-handlers/render-association-cache-handler";
import { getCurrentUserId } from "@/lib/auth/get-user";
import { isNoDbMode } from "@/lib/database/utils";
import { DeviceDisplayMode } from "@/lib/mixup/constants";
import { DefaultImageMimeType } from "@/lib/render/device-image-url";
import { getDeviceProfile } from "@/lib/trmnl/device-profile";
import type { DeviceProfile } from "@/lib/trmnl/types";
import type { Device } from "@/lib/types";
import { configuredTimezone } from "@/lib/utils";
import {
	createErrorRenderAssociationValuesForDevice,
	createRenderAssociationValuesForDevice,
	createRenderAssociationValuesForSettings,
	getCurrentScreenAssociation,
	getDevicePreviewScreenUrls,
	resolveAssociationValues,
	resolveDeviceProfile,
} from "./render-association";
import {
	AssociationRenderSettings,
	RenderAssociationType,
	type RenderAssociationValues,
} from "./render-association-types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/cache-handlers/render-association-cache-handler", () => ({
	getCurrentScreenCacheEntry: jest.fn(),
	getNewAssociationId: jest.fn(),
	getRenderAssociatedCacheEntry: jest.fn(),
	setRenderAssociationCacheEntry: jest.fn(),
}));
jest.mock("@/app/actions/device", () => ({
	fetchDeviceByApiKey: jest.fn(),
}));
jest.mock("@/lib/auth/get-user", () => ({
	getCurrentUserId: jest.fn(),
}));
jest.mock("@/lib/database/utils", () => ({
	isNoDbMode: jest.fn(),
}));
jest.mock("@/lib/trmnl/device-profile", () => ({
	DEFAULT_MODEL_NAME: "og_plus",
	getDeviceProfile: jest.fn(),
}));
jest.mock("@/lib/utils", () => ({
	configuredTimezone: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDevice(overrides: Partial<Device> = {}): Device {
	return {
		id: 1,
		name: "Test Device",
		mac_address: "AA:BB:CC:DD:EE:FF",
		api_key: "testApiKey12345678901",
		friendly_id: "ABC123",
		screen: null,
		refresh_schedule: null,
		timezone: "America/New_York",
		last_update_time: null,
		next_expected_update: null,
		last_refresh_duration: null,
		battery_voltage: null,
		firmware_version: null,
		rssi: null,
		created_at: null,
		updated_at: null,
		playlist_id: null,
		mixup_id: null,
		display_mode: DeviceDisplayMode.SCREEN,
		current_playlist_index: null,
		user_id: "user-123",
		screen_width: null,
		screen_height: null,
		screen_orientation: null,
		grayscale: null,
		model: null,
		palette_id: null,
		sleep_mode_enabled: false,
		sleep_start_time: null,
		sleep_end_time: null,
		temperature_profile: "default",
		supports_temperature_profile: null,
		...overrides,
	};
}

function makeProfile(): DeviceProfile {
	return {
		model: {
			name: "og_plus",
			label: "TRMNL",
			width: 800,
			height: 480,
			colors: 2,
			bit_depth: 1,
			scale_factor: 1,
			rotation: 0,
			mime_type: "image/bmp",
			offset_x: 0,
			offset_y: 0,
			palette_ids: [],
		},
		palette: null,
	};
}

function makeAssociationValues(
	overrides: Partial<RenderAssociationValues> = {},
): RenderAssociationValues {
	return {
		associationId: "assoc-id",
		type: RenderAssociationType.devicePreview,
		imageUrl: "/api/bitmap/assoc-id.bmp",
		screenId: "my-screen",
		renderSettings: {
			width: null,
			height: null,
			modelName: "og_plus",
			paletteId: null,
			orientation: "landscape",
			mimeType: DefaultImageMimeType,
		},
		device: { id: 1, apiKey: "testApiKey12345678901" },
		dataParams: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation(() => {});
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
	jest.restoreAllMocks();
});

beforeEach(() => {
	jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createRenderAssociationValuesForDevice
// ---------------------------------------------------------------------------

describe("createRenderAssociationValuesForDevice", () => {
	beforeEach(() => {
		jest.mocked(getNewAssociationId).mockReturnValue("test-id");
		jest.mocked(getDeviceProfile).mockResolvedValue(makeProfile());
	});

	it("uses DEFAULT_MODEL_NAME when device.model is null", async () => {
		const result = await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.devicePreview,
			device: makeDevice({ model: null }),
			screenId: "s",
			renderSettings: null,
			dataParams: null,
		});
		expect(getDeviceProfile).toHaveBeenCalledWith("og_plus", null);
		expect(result.renderSettings.modelName).toBe("og_plus");
		expect(result.renderSettings.mimeType).toBe("image/bmp");
	});

	it("uses device.model and device.palette_id when set", async () => {
		await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.devicePreview,
			device: makeDevice({ model: "og", palette_id: "bw" }),
			screenId: "s",
			renderSettings: null,
			dataParams: null,
		});
		expect(getDeviceProfile).toHaveBeenCalledWith("og", "bw");
	});

	it("sets imageUrl and associationId from helpers", async () => {
		const result = await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.devicePreview,
			device: makeDevice(),
			screenId: "s",
			renderSettings: null,
			dataParams: null,
		});
		expect(result.associationId).toBe("test-id");
		expect(result.imageUrl).toBe("/api/bitmap/test-id.bmp");
	});

	it("defaults orientation to 'landscape' when device.screen_orientation is null", async () => {
		const result = await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.devicePreview,
			device: makeDevice({ screen_orientation: null }),
			screenId: "s",
			renderSettings: null,
			dataParams: null,
		});
		expect(result.renderSettings.orientation).toBe("landscape");
	});

	it("uses device.screen_orientation when set", async () => {
		const result = await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.devicePreview,
			device: makeDevice({ screen_orientation: "portrait" }),
			screenId: "s",
			renderSettings: null,
			dataParams: null,
		});
		expect(result.renderSettings.orientation).toBe("portrait");
	});

	it("sets device.id and device.apiKey from the device", async () => {
		const result = await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.devicePreview,
			device: makeDevice({ id: 42, api_key: "myApiKey" }),
			screenId: "s",
			renderSettings: null,
			dataParams: null,
		});
		expect(result.device).toEqual({ id: 42, apiKey: "myApiKey" });
	});

	it("passes screenId, type, and dataParams through to the result", async () => {
		const result = await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.display,
			device: makeDevice(),
			screenId: "my-screen",
			renderSettings: null,
			dataParams: { errorMessage: "oops" },
		});
		expect(result.screenId).toBe("my-screen");
		expect(result.type).toBe(RenderAssociationType.display);
		expect(result.dataParams).toEqual({ errorMessage: "oops" });
	});

	it("throws when type is recipePreview and recipePreview is missing", async () => {
		await expect(
			createRenderAssociationValuesForDevice({
				type: RenderAssociationType.recipePreview,
				device: makeDevice(),
				screenId: "s",
				renderSettings: null,
				dataParams: null,
			}),
		).rejects.toThrow("Association value missing 'recipePreview'");
	});

	it("does not throw when type is recipePreview and recipePreview is provided", async () => {
		await expect(
			createRenderAssociationValuesForDevice({
				type: RenderAssociationType.recipePreview,
				device: makeDevice(),
				screenId: "s",
				renderSettings: null,
				recipePreview: { userId: "u1" },
				dataParams: null,
			}),
		).resolves.toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// createRenderAssociationValuesForSettings
// ---------------------------------------------------------------------------

describe("createRenderAssociationValuesForSettings", () => {
	const renderSettings: AssociationRenderSettings = {
		width: null,
		height: null,
		modelName: "og",
		paletteId: "bw",
		orientation: "portrait",
		mimeType: DefaultImageMimeType,
	};

	beforeEach(() => {
		jest.mocked(getNewAssociationId).mockReturnValue("settings-id");
		jest.mocked(getDeviceProfile).mockResolvedValue(makeProfile());
	});

	it("calls getDeviceProfile with renderSettings.modelName and paletteId", async () => {
		await createRenderAssociationValuesForSettings({
			type: RenderAssociationType.recipePreview,
			screenId: "s",
			renderSettings,
			recipePreview: { userId: "u1" },
			dataParams: null,
		});
		expect(getDeviceProfile).toHaveBeenCalledWith("og", "bw");
	});

	it("includes recipePreview in the result", async () => {
		const preview = { userId: "u1" };
		const result = await createRenderAssociationValuesForSettings({
			type: RenderAssociationType.recipePreview,
			screenId: "screen-1",
			renderSettings,
			recipePreview: preview,
			dataParams: null,
		});
		expect(result.recipePreview).toEqual(preview);
	});

	it("passes renderSettings through to the result", async () => {
		const result = await createRenderAssociationValuesForSettings({
			type: RenderAssociationType.recipePreview,
			screenId: "s",
			renderSettings,
			recipePreview: { userId: "u1" },
			dataParams: null,
		});
		expect(result.renderSettings).toEqual(renderSettings);
	});

	it("throws when type is recipePreview and recipePreview is missing", async () => {
		await expect(
			createRenderAssociationValuesForSettings({
				type: RenderAssociationType.recipePreview,
				screenId: "s",
				renderSettings,
				dataParams: null,
			}),
		).rejects.toThrow("Association value missing 'recipePreview'");
	});

	it("does not require recipePreview for devicePreview type", async () => {
		await expect(
			createRenderAssociationValuesForSettings({
				type: RenderAssociationType.devicePreview,
				screenId: "s",
				renderSettings,
				dataParams: null,
			}),
		).resolves.toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// createErrorRenderAssociationValuesForDevice
// ---------------------------------------------------------------------------

describe("createErrorRenderAssociationValuesForDevice", () => {
	beforeEach(() => {
		jest.mocked(getNewAssociationId).mockReturnValue("err-id");
		jest.mocked(getDeviceProfile).mockResolvedValue(makeProfile());
	});

	it("uses the error screen ID", async () => {
		const result = await createErrorRenderAssociationValuesForDevice({
			type: RenderAssociationType.devicePreview,
			device: makeDevice(),
			errorMessage: "Something went wrong",
		});
		expect(result.screenId).toBe("error");
	});

	it("stores errorMessage in dataParams", async () => {
		const result = await createErrorRenderAssociationValuesForDevice({
			type: RenderAssociationType.devicePreview,
			device: makeDevice(),
			errorMessage: "Screen not found",
		});
		expect(result.dataParams).toEqual({ errorMessage: "Screen not found" });
	});

	it("preserves the provided type", async () => {
		const result = await createErrorRenderAssociationValuesForDevice({
			type: RenderAssociationType.display,
			device: makeDevice(),
			errorMessage: "err",
		});
		expect(result.type).toBe(RenderAssociationType.display);
	});
});

// ---------------------------------------------------------------------------
// resolveDeviceProfile
// ---------------------------------------------------------------------------

describe("resolveDeviceProfile", () => {
	beforeEach(() => {
		jest.mocked(getDeviceProfile).mockResolvedValue(makeProfile());
	});

	it("calls getDeviceProfile with device.model and device.palette_id", async () => {
		await resolveDeviceProfile(makeDevice({ model: "og", palette_id: "bw" }));
		expect(getDeviceProfile).toHaveBeenCalledWith("og", "bw");
	});

	it("falls back to DEFAULT_MODEL_NAME when device.model is null", async () => {
		await resolveDeviceProfile(makeDevice({ model: null }));
		expect(getDeviceProfile).toHaveBeenCalledWith("og_plus", null);
	});

	it("passes null palette_id when device.palette_id is null", async () => {
		await resolveDeviceProfile(makeDevice({ model: "og", palette_id: null }));
		expect(getDeviceProfile).toHaveBeenCalledWith("og", null);
	});

	it("returns the profile from getDeviceProfile", async () => {
		const profile = makeProfile();
		jest.mocked(getDeviceProfile).mockResolvedValue(profile);
		const result = await resolveDeviceProfile(makeDevice());
		expect(result).toBe(profile);
	});
});

// ---------------------------------------------------------------------------
// resolveAssociationData — recipePreview type
// ---------------------------------------------------------------------------

describe("resolveAssociationData — recipePreview type", () => {
	beforeEach(() => {
		jest.mocked(configuredTimezone).mockReturnValue("Europe/London");
	});

	it("returns a pseudo device with the userId", async () => {
		const values = makeAssociationValues({
			type: RenderAssociationType.recipePreview,
			recipePreview: { userId: "user-abc" },
			renderSettings: {
				width: null,
				height: null,
				modelName: "og",
				paletteId: "bw",
				orientation: "landscape",
				mimeType: DefaultImageMimeType,
			},
		});
		const result = await resolveAssociationValues(values);
		expect(result).not.toBeNull();
		expect(result?.userId).toBe("user-abc");
		expect(result?.device.user_id).toBe("user-abc");
		expect(result?.device.name).toBe("PseudoPreviewDevice");
	});

	it("uses configuredTimezone() for internalValues.$timezone", async () => {
		const result = await resolveAssociationValues(
			makeAssociationValues({
				type: RenderAssociationType.recipePreview,
				recipePreview: { userId: "u1" },
			}),
		);
		expect(result?.renderDataValues.$timezone).toBe("Europe/London");
	});

	it("throws when preview object is missing", async () => {
		const values = makeAssociationValues({
			type: RenderAssociationType.recipePreview,
			recipePreview: undefined,
		});
		await expect(resolveAssociationValues(values)).rejects.toThrow(
			"Render association entry missing 'reviewPreview'",
		);
	});

	it("throws when userId is null in preview", async () => {
		const values = makeAssociationValues({
			type: RenderAssociationType.recipePreview,
			recipePreview: { userId: null },
		});
		await expect(resolveAssociationValues(values)).rejects.toThrow(
			"Render association preview missing user ID.",
		);
	});
});

// ---------------------------------------------------------------------------
// resolveAssociationData — display / devicePreview type
// ---------------------------------------------------------------------------

describe("resolveAssociationData — display type", () => {
	const mockDevice = makeDevice({ user_id: "db-user", timezone: "Asia/Tokyo" });

	beforeEach(() => {
		jest.mocked(fetchDeviceByApiKey).mockResolvedValue(mockDevice);
	});

	it("throws when associationDevice is missing", async () => {
		const values = makeAssociationValues({
			type: RenderAssociationType.display,
			device: undefined,
		});
		await expect(resolveAssociationValues(values)).rejects.toThrow(
			"Render association entry missing 'device'",
		);
	});

	it("fetches device by the stored apiKey", async () => {
		await resolveAssociationValues(
			makeAssociationValues({
				type: RenderAssociationType.display,
				device: { id: 1, apiKey: "stored-key" },
			}),
		);
		expect(fetchDeviceByApiKey).toHaveBeenCalledWith("stored-key", {
			assumeDbReady: true,
		});
	});

	it("returns null when device is not found", async () => {
		jest.mocked(fetchDeviceByApiKey).mockResolvedValue(null);
		const result = await resolveAssociationValues(
			makeAssociationValues({ type: RenderAssociationType.display }),
		);
		expect(result).toBeNull();
	});

	it("returns null when device has no user_id", async () => {
		jest
			.mocked(fetchDeviceByApiKey)
			.mockResolvedValue(makeDevice({ user_id: null }));
		const result = await resolveAssociationValues(
			makeAssociationValues({ type: RenderAssociationType.display }),
		);
		expect(result).toBeNull();
	});

	it("returns userId, the fetched device, and device.timezone", async () => {
		const result = await resolveAssociationValues(
			makeAssociationValues({ type: RenderAssociationType.display }),
		);
		expect(result).not.toBeNull();
		expect(result?.userId).toBe("db-user");
		expect(result?.device).toBe(mockDevice);
		expect(result?.renderDataValues.$timezone).toBe("Asia/Tokyo");
	});
});

// ---------------------------------------------------------------------------
// getCurrentScreenAssociation
// ---------------------------------------------------------------------------

describe("getCurrentScreenAssociation", () => {
	beforeEach(() => {
		jest.mocked(getNewAssociationId).mockReturnValue("new-id");
		jest.mocked(getDeviceProfile).mockResolvedValue(makeProfile());
	});

	it("looks up cache using device.friendly_id", async () => {
		jest.mocked(getCurrentScreenCacheEntry).mockResolvedValue(null);
		await getCurrentScreenAssociation(makeDevice({ friendly_id: "XYZ999" }));
		expect(getCurrentScreenCacheEntry).toHaveBeenCalledWith("XYZ999");
	});

	it("returns an error association and sets cache when no entry exists", async () => {
		jest.mocked(getCurrentScreenCacheEntry).mockResolvedValue(null);

		const result = await getCurrentScreenAssociation(makeDevice());

		expect(result.screenId).toBe("error");
		expect(setRenderAssociationCacheEntry).toHaveBeenCalledWith(result);
	});

	it("re-sets cache and returns existing association when render entry is missing", async () => {
		const cached = makeAssociationValues({ associationId: "cached-id" });
		jest.mocked(getCurrentScreenCacheEntry).mockResolvedValue(cached);
		jest.mocked(getRenderAssociatedCacheEntry).mockResolvedValue(null);

		const result = await getCurrentScreenAssociation(makeDevice());

		expect(result).toBe(cached);
		expect(setRenderAssociationCacheEntry).toHaveBeenCalledWith(cached);
	});

	it("returns existing association without re-setting when render entry exists", async () => {
		const cached = makeAssociationValues({ associationId: "cached-id" });
		jest.mocked(getCurrentScreenCacheEntry).mockResolvedValue(cached);
		jest.mocked(getRenderAssociatedCacheEntry).mockResolvedValue(cached);

		const result = await getCurrentScreenAssociation(makeDevice());

		expect(result).toBe(cached);
		expect(setRenderAssociationCacheEntry).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// getDevicePreviewScreenUrls
// ---------------------------------------------------------------------------

describe("getDevicePreviewScreenUrls", () => {
	beforeEach(() => {
		jest.mocked(isNoDbMode).mockReturnValue(false);
		jest.mocked(getCurrentUserId).mockResolvedValue("preview-user");
		jest.mocked(getNewAssociationId).mockReturnValue("prev-id");
		jest.mocked(getDeviceProfile).mockResolvedValue(makeProfile());
	});

	it("throws when not in noDb mode and userId cannot be determined", async () => {
		jest.mocked(getCurrentUserId).mockResolvedValue(null);
		await expect(
			getDevicePreviewScreenUrls({
				device: makeDevice(),
				playlistScreens: [],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			}),
		).rejects.toThrow("Current user could not be determined.");
	});

	it("skips the user check in noDb mode", async () => {
		jest.mocked(isNoDbMode).mockReturnValue(true);
		jest.mocked(getCurrentUserId).mockResolvedValue(null);
		await expect(
			getDevicePreviewScreenUrls({
				device: makeDevice({ screen: "my-screen" }),
				playlistScreens: [],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			}),
		).resolves.toBeDefined();
	});

	describe("PLAYLIST mode", () => {
		it("returns an error URL and sets cache when playlist_id is not set", async () => {
			const device = makeDevice({
				display_mode: DeviceDisplayMode.PLAYLIST,
				playlist_id: null,
			});
			const urls = await getDevicePreviewScreenUrls({
				device,
				playlistScreens: [],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			});
			expect(urls).toHaveLength(1);
			expect(setRenderAssociationCacheEntry).toHaveBeenCalled();
			const cached = jest.mocked(setRenderAssociationCacheEntry).mock
				.calls[0][0];
			expect(cached.screenId).toBe("error");
		});

		it("returns an error URL for a playlist item with no screen", async () => {
			const device = makeDevice({
				display_mode: DeviceDisplayMode.PLAYLIST,
				playlist_id: "pl-1",
			});
			const urls = await getDevicePreviewScreenUrls({
				device,
				playlistScreens: [{ screen: null as unknown as string, duration: 60 }],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			});
			expect(urls).toHaveLength(1);
			const cached = jest.mocked(setRenderAssociationCacheEntry).mock
				.calls[0][0];
			expect(cached.screenId).toBe("error");
		});

		it("returns a URL for each valid playlist screen", async () => {
			jest
				.mocked(getNewAssociationId)
				.mockReturnValueOnce("id1")
				.mockReturnValueOnce("id2");

			const device = makeDevice({
				display_mode: DeviceDisplayMode.PLAYLIST,
				playlist_id: "pl-1",
			});

			const urls = await getDevicePreviewScreenUrls({
				device,
				playlistScreens: [
					{ screen: "screen-a", duration: 30 },
					{ screen: "screen-b", duration: 60 },
				],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			});
			expect(urls).toHaveLength(2);
			expect(urls[0]).toBe("/api/bitmap/id1.bmp");
			expect(urls[1]).toBe("/api/bitmap/id2.bmp");
		});
	});

	describe("MIXUP mode", () => {
		it("returns an error URL and sets cache when mixup_id is not set", async () => {
			const device = makeDevice({
				display_mode: DeviceDisplayMode.MIXUP,
				mixup_id: null,
			});
			const urls = await getDevicePreviewScreenUrls({
				device,
				playlistScreens: [],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			});
			expect(urls).toHaveLength(1);
			const cached = jest.mocked(setRenderAssociationCacheEntry).mock
				.calls[0][0];
			expect(cached.screenId).toBe("error");
		});

		it("returns a single URL using mixup screenId", async () => {
			const device = makeDevice({
				display_mode: DeviceDisplayMode.MIXUP,
				mixup_id: "mixup-42",
			});
			const urls = await getDevicePreviewScreenUrls({
				device,
				playlistScreens: [],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			});
			expect(urls).toHaveLength(1);
			expect(urls[0]).toBe("/api/bitmap/prev-id.bmp");
			const cached = jest.mocked(setRenderAssociationCacheEntry).mock
				.calls[0][0];
			expect(cached.screenId).toBe("mixup/mixup-42");
		});
	});

	describe("SCREEN mode", () => {
		it("returns an error URL and sets cache when device.screen is null", async () => {
			const device = makeDevice({
				display_mode: DeviceDisplayMode.SCREEN,
				screen: null,
			});
			const urls = await getDevicePreviewScreenUrls({
				device,
				playlistScreens: [],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			});
			expect(urls).toHaveLength(1);
			const cached = jest.mocked(setRenderAssociationCacheEntry).mock
				.calls[0][0];
			expect(cached.screenId).toBe("error");
		});

		it("returns a single URL with the device screen as screenId", async () => {
			const device = makeDevice({
				display_mode: DeviceDisplayMode.SCREEN,
				screen: "my-screen",
			});
			const urls = await getDevicePreviewScreenUrls({
				device,
				playlistScreens: [],
				renderSettings: {
					width: null,
					height: null,
					modelName: null,
					paletteId: null,
					orientation: null,
					mimeType: null,
				},
			});
			expect(urls).toHaveLength(1);
			expect(urls[0]).toBe("/api/bitmap/prev-id.bmp");
			const cached = jest.mocked(setRenderAssociationCacheEntry).mock
				.calls[0][0];
			expect(cached.screenId).toBe("my-screen");
		});
	});
});
