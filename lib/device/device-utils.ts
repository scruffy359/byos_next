import { Selectable, Updateable } from "kysely";
import {
	DeviceDisplayMode as DbDeviceDisplayMode,
	Devices,
} from "../database/db.d";
import { Device, DeviceDisplayMode, TemperatureProfile } from "../types";
import { normalizeRefreshSchedule } from "./defaults";

export type DeviceSelect = Selectable<Devices>;
export type DeviceUpdate = Updateable<Devices>;

const normalizeDateField = (value: Date | null) => {
	return value ? value.toISOString() : null;
};

const normalizeDisplayMode = (
	input: DbDeviceDisplayMode | null,
): DeviceDisplayMode | null => {
	if (!input) {
		return null;
	}

	if ((Object.values(DeviceDisplayMode) as string[]).includes(input)) {
		return input as DeviceDisplayMode;
	}

	throw new Error(`Invalid status string: ${input}`);
};

const normalizeTeperatureProfile = (
	input: string | null,
): TemperatureProfile => {
	return input as TemperatureProfile;
};

export const normalizeSelectedDevice = (
	selectedDevice: DeviceSelect,
): Device => {
	const {
		id,
		refresh_schedule,
		last_update_time,
		next_expected_update,
		battery_voltage,
		created_at,
		updated_at,
		display_mode,
		temperature_profile,
	} = selectedDevice;
	const result: Device = {
		...selectedDevice,
		id: parseInt(id, 10),
		refresh_schedule: normalizeRefreshSchedule(refresh_schedule),
		last_update_time: normalizeDateField(last_update_time),
		next_expected_update: normalizeDateField(next_expected_update),
		battery_voltage: battery_voltage ? parseInt(battery_voltage, 10) : null,
		created_at: normalizeDateField(created_at),
		updated_at: normalizeDateField(updated_at),
		display_mode: normalizeDisplayMode(display_mode),
		temperature_profile: normalizeTeperatureProfile(temperature_profile),
	};
	return result;
};
