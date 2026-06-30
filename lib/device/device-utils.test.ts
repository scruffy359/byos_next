import { DeviceDisplayMode } from "@/lib/mixup/constants";
import type { DeviceSelect } from "./device-utils";
import { normalizeSelectedDevice } from "./device-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeviceSelect(overrides: Partial<DeviceSelect> = {}): DeviceSelect {
	return {
		id: "1",
		name: "Test Device",
		mac_address: "AA:BB:CC:DD:EE:FF",
		api_key: "testApiKey12345678901",
		friendly_id: "ABC123",
		screen: null,
		refresh_schedule: null,
		timezone: "UTC",
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
		display_mode: null,
		current_playlist_index: null,
		user_id: null,
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

// ---------------------------------------------------------------------------
// normalizeSelectedDevice — id
// ---------------------------------------------------------------------------

describe("normalizeSelectedDevice — id", () => {
	it("parses string id to integer", () => {
		const result = normalizeSelectedDevice(makeDeviceSelect({ id: "42" }));
		expect(result.id).toBe(42);
		expect(typeof result.id).toBe("number");
	});

	it("handles large bigint-style string ids", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ id: "9007199254740991" }),
		);
		expect(result.id).toBe(9007199254740991);
	});
});

// ---------------------------------------------------------------------------
// normalizeSelectedDevice — battery_voltage
// ---------------------------------------------------------------------------

describe("normalizeSelectedDevice — battery_voltage", () => {
	it("returns null when battery_voltage is null", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ battery_voltage: null }),
		);
		expect(result.battery_voltage).toBeNull();
	});

	it("parses string battery_voltage to integer", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ battery_voltage: "4200" }),
		);
		expect(result.battery_voltage).toBe(4200);
		expect(typeof result.battery_voltage).toBe("number");
	});
});

// ---------------------------------------------------------------------------
// normalizeSelectedDevice — date fields
// ---------------------------------------------------------------------------

describe("normalizeSelectedDevice — date fields", () => {
	const testDate = new Date("2024-06-15T10:30:00.000Z");
	const expectedIso = "2024-06-15T10:30:00.000Z";

	it("converts last_update_time Date to ISO string", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ last_update_time: testDate }),
		);
		expect(result.last_update_time).toBe(expectedIso);
	});

	it("returns null for null last_update_time", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ last_update_time: null }),
		);
		expect(result.last_update_time).toBeNull();
	});

	it("converts next_expected_update Date to ISO string", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ next_expected_update: testDate }),
		);
		expect(result.next_expected_update).toBe(expectedIso);
	});

	it("returns null for null next_expected_update", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ next_expected_update: null }),
		);
		expect(result.next_expected_update).toBeNull();
	});

	it("converts created_at Date to ISO string", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ created_at: testDate }),
		);
		expect(result.created_at).toBe(expectedIso);
	});

	it("returns null for null created_at", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ created_at: null }),
		);
		expect(result.created_at).toBeNull();
	});

	it("converts updated_at Date to ISO string", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ updated_at: testDate }),
		);
		expect(result.updated_at).toBe(expectedIso);
	});

	it("returns null for null updated_at", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ updated_at: null }),
		);
		expect(result.updated_at).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// normalizeSelectedDevice — display_mode
// ---------------------------------------------------------------------------

describe("normalizeSelectedDevice — display_mode", () => {
	it("returns null for null display_mode", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ display_mode: null }),
		);
		expect(result.display_mode).toBeNull();
	});

	it("maps 'screen' to DeviceDisplayMode.SCREEN", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ display_mode: "screen" }),
		);
		expect(result.display_mode).toBe(DeviceDisplayMode.SCREEN);
	});

	it("maps 'playlist' to DeviceDisplayMode.PLAYLIST", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ display_mode: "playlist" }),
		);
		expect(result.display_mode).toBe(DeviceDisplayMode.PLAYLIST);
	});

	it("maps 'mixup' to DeviceDisplayMode.MIXUP", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ display_mode: "mixup" }),
		);
		expect(result.display_mode).toBe(DeviceDisplayMode.MIXUP);
	});

	it("throws for an unrecognised display_mode string", () => {
		expect(() =>
			normalizeSelectedDevice(
				// Force an invalid value through the type system to simulate bad DB data
				makeDeviceSelect({ display_mode: "unknown" as "screen" }),
			),
		).toThrow("Invalid status string: unknown");
	});
});

// ---------------------------------------------------------------------------
// normalizeSelectedDevice — temperature_profile
// ---------------------------------------------------------------------------

describe("normalizeSelectedDevice — temperature_profile", () => {
	it.each([
		"default",
		"a",
		"b",
		"c",
	] as const)("passes through temperature_profile '%s'", (profile) => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ temperature_profile: profile }),
		);
		expect(result.temperature_profile).toBe(profile);
	});
});

// ---------------------------------------------------------------------------
// normalizeSelectedDevice — refresh_schedule
// ---------------------------------------------------------------------------

describe("normalizeSelectedDevice — refresh_schedule", () => {
	it("returns null for null refresh_schedule", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ refresh_schedule: null }),
		);
		expect(result.refresh_schedule).toBeNull();
	});

	it("parses a valid JSON-string refresh_schedule", () => {
		const schedule = {
			default_refresh_rate: 60,
			time_ranges: [
				{ start_time: "00:00", end_time: "07:00", refresh_rate: 3600 },
			],
		};
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ refresh_schedule: JSON.stringify(schedule) }),
		);
		expect(result.refresh_schedule).toEqual(schedule);
	});

	it("parses an object refresh_schedule directly", () => {
		const schedule = { default_refresh_rate: 300, time_ranges: [] };
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ refresh_schedule: schedule }),
		);
		expect(result.refresh_schedule).toEqual(schedule);
	});

	it("returns null for a malformed JSON string", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ refresh_schedule: "{bad json" }),
		);
		expect(result.refresh_schedule).toBeNull();
	});

	it("returns null for a schedule missing default_refresh_rate", () => {
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ refresh_schedule: { time_ranges: [] } }),
		);
		expect(result.refresh_schedule).toBeNull();
	});

	it("filters out malformed time_range entries", () => {
		const schedule = {
			default_refresh_rate: 60,
			time_ranges: [
				{ start_time: "08:00", end_time: "20:00", refresh_rate: 120 },
				{ start_time: "bad" }, // missing end_time and refresh_rate
			],
		};
		const result = normalizeSelectedDevice(
			makeDeviceSelect({ refresh_schedule: schedule }),
		);
		expect(result.refresh_schedule?.time_ranges).toHaveLength(1);
		expect(result.refresh_schedule?.time_ranges[0].start_time).toBe("08:00");
	});
});

// ---------------------------------------------------------------------------
// normalizeSelectedDevice — passthrough fields
// ---------------------------------------------------------------------------

describe("normalizeSelectedDevice — passthrough fields", () => {
	it("preserves all non-transformed string fields", () => {
		const select = makeDeviceSelect({
			name: "My Device",
			mac_address: "11:22:33:44:55:66",
			api_key: "someApiKey1234567890",
			friendly_id: "XYZ999",
			timezone: "America/New_York",
			firmware_version: "1.2.3",
			screen: "simple-text",
		});
		const result = normalizeSelectedDevice(select);
		expect(result.name).toBe("My Device");
		expect(result.mac_address).toBe("11:22:33:44:55:66");
		expect(result.api_key).toBe("someApiKey1234567890");
		expect(result.friendly_id).toBe("XYZ999");
		expect(result.timezone).toBe("America/New_York");
		expect(result.firmware_version).toBe("1.2.3");
		expect(result.screen).toBe("simple-text");
	});

	it("preserves numeric and boolean fields", () => {
		const select = makeDeviceSelect({
			rssi: -72,
			last_refresh_duration: 5,
			current_playlist_index: 3,
			screen_width: 800,
			screen_height: 480,
			grayscale: 0,
			sleep_mode_enabled: true,
			sleep_start_time: 0,
			sleep_end_time: 420,
			supports_temperature_profile: true,
		});
		const result = normalizeSelectedDevice(select);
		expect(result.rssi).toBe(-72);
		expect(result.last_refresh_duration).toBe(5);
		expect(result.current_playlist_index).toBe(3);
		expect(result.screen_width).toBe(800);
		expect(result.screen_height).toBe(480);
		expect(result.grayscale).toBe(0);
		expect(result.sleep_mode_enabled).toBe(true);
		expect(result.sleep_start_time).toBe(0);
		expect(result.sleep_end_time).toBe(420);
		expect(result.supports_temperature_profile).toBe(true);
	});
});
