import { NextResponse } from "next/server";
import { withExplicitUserScope } from "@/lib/database/scoped-db";
import { checkDbConnection } from "@/lib/database/utils";
import {
	DISPLAY_FALLBACK_REFRESH_SECONDS,
	normalizeRefreshSchedule,
} from "@/lib/device/defaults";
import { normalizeSelectedDevice } from "@/lib/device/device-utils";
import { selectDisplayForDevice } from "@/lib/display/select";
import { logError, logInfo } from "@/lib/logger";
import { buildDeviceImageFilename } from "@/lib/render/device-image-url";
import { getCurrentScreenAssociation } from "@/lib/render/render-association";
import { parseRequestHeaders, resolveUserIdFromApiKey } from "../utils";

/**
 * GET /api/display/current
 * Fetch the current screen for a device.
 *
 * Headers:
 * - Access-Token (required): Device API Key
 */
export async function GET(request: Request) {
	const headers = parseRequestHeaders(request);
	const { apiKey } = headers;
	const apiKeyPrefix = apiKey?.slice(0, 6);

	if (!apiKey) {
		return NextResponse.json(
			{ status: 401, error: "Access-Token header is required" },
			{ status: 401 },
		);
	}

	const { ready } = await checkDbConnection();
	if (!ready) {
		logInfo("Database not available for /api/display/current", {
			source: "api/display/current",
			metadata: { apiKey: apiKeyPrefix },
		});
		return NextResponse.json(
			{ status: 503, error: "Database not available" },
			{ status: 503 },
		);
	}

	try {
		const userId = await resolveUserIdFromApiKey(apiKey, {
			assumeDbReady: true,
		});
		const device = userId
			? await withExplicitUserScope(userId, (scopedDb) =>
					scopedDb
						.selectFrom("devices")
						.selectAll()
						.where("api_key", "=", apiKey)
						.executeTakeFirst(),
				)
			: null;

		if (!device) {
			return NextResponse.json(
				{ status: 404, error: "Device not found" },
				{ status: 404 },
			);
		}

		const normalizedDevice = normalizeSelectedDevice(device);

		// TODO: fix; get current screen
		const associationValues =
			await getCurrentScreenAssociation(normalizedDevice);

		const selection = await selectDisplayForDevice(normalizedDevice, {
			hostUrl: headers.hostUrl,
			renderAssociationId: associationValues.associationId,
			width: headers.width,
			height: headers.height,
		});

		const refreshSchedule = normalizeRefreshSchedule(
			normalizedDevice.refresh_schedule,
		);
		const refreshRate =
			refreshSchedule?.default_refresh_rate || DISPLAY_FALLBACK_REFRESH_SECONDS;

		logInfo("Current display request successful", {
			source: "api/display/current",
			metadata: {
				deviceId: normalizedDevice.friendly_id,
				// TODO: this is not correct as it's not the actually active screen.
				screen: selection.screen,
			},
		});

		return NextResponse.json(
			{
				status: 200,
				refresh_rate: refreshRate,
				image_url: selection.imageUrl,
				filename: buildDeviceImageFilename(
					selection.screen,
					"current",
					selection.profile,
				),
				rendered_at:
					normalizedDevice.last_update_time || new Date().toISOString(),
			},
			{ status: 200 },
		);
	} catch (error) {
		logError(error as Error, {
			source: "api/display/current",
			metadata: { apiKey: apiKeyPrefix },
		});
		return NextResponse.json(
			{ status: 500, error: "Internal server error" },
			{ status: 500 },
		);
	}
}
