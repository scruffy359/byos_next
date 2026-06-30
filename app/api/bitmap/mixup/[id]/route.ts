import type { NextRequest } from "next/server";
import sharp from "sharp";
import { getRenderAssociatedCacheEntry } from "@/cache-handlers/render-association-cache-handler";
import { withExplicitUserScope } from "@/lib/database/scoped-db";
import { checkDbConnection } from "@/lib/database/utils";
import { getLayoutById, type LayoutSlot } from "@/lib/mixup/constants";
import {
	DEFAULT_IMAGE_HEIGHT,
	DEFAULT_IMAGE_WIDTH,
} from "@/lib/recipes/constants";
import { logger } from "@/lib/recipes/logger";
import { renderRecipeToImage } from "@/lib/recipes/recipe-renderer";
import { renderDeviceImage } from "@/lib/render/device-image";
import { stripImageExtension } from "@/lib/render/device-image-url";
import { renderErrorImage } from "@/lib/render/error-image";
import { parseImageRequest } from "@/lib/render/image-request";
import {
	resolveAssociationData,
	resolveDeviceProfile,
} from "@/lib/render/render-association";
import { RenderAssociationType } from "@/lib/render/render-association-types";
import { FormatValue } from "@/lib/types";
import { configuredTimezone } from "@/lib/utils";
import { DitheringMethod, renderBmp } from "@/utils/render-bmp";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { id } = await params;
		const associationId = stripImageExtension(id);

		// validate database is available.
		const { ready } = await checkDbConnection();
		if (!ready) {
			logger.error("Database not available for mixup rendering");
			const image = await renderErrorImage({
				message: "Database not available",
			});
			return imageResponse(image, 503);
		}

		const { searchParams } = new URL(req.url);
		const imageRequest = parseImageRequest(searchParams, {
			width: DEFAULT_IMAGE_WIDTH,
			height: DEFAULT_IMAGE_HEIGHT,
		});
		if (imageRequest instanceof Response) return imageRequest;

		const associatedValues = await getRenderAssociatedCacheEntry(associationId);

		if (associatedValues === null) {
			throw new Error(
				`Mixup Screen cannot be found for Association ID: ${associationId}`,
			);
		}

		const { screenId, type: associationType } = associatedValues;

		const mixupId = screenId;

		// Resolve the device owner so recipe parameters are scoped to proper user.
		const resolvedData = await resolveAssociationData(associatedValues);
		if (!resolvedData) {
			throw new Error(
				"Required render association data could not be resolved.",
			);
		}
		const { userId, device } = resolvedData;

		if (!userId) {
			return new Response("Access token is required", { status: 401 });
		}

		const profile = await resolveDeviceProfile(device);

		const $timezone = searchParams.get("$timezone") || configuredTimezone();
		const width = imageRequest.width ?? DEFAULT_IMAGE_WIDTH;
		const height = imageRequest.height ?? DEFAULT_IMAGE_HEIGHT;
		const grayscaleLevels = imageRequest.grayscaleLevels;

		// Two auth paths:
		//  1. Device callback — `access_token` query param or `Access-Token` header
		//     matches a device whose `mixup_id` is this one.
		//  2. Browser/admin — signed-in user owns the mixup. Used by the UI
		//     (mixup-list, device-view, device-edit-form) which can't add an
		//     access_token to <img> srcs.

		if (associationType === RenderAssociationType.display) {
			if (!device || device.mixup_id !== mixupId || !device.user_id) {
				return new Response("Mixup not found", { status: 404 });
			}
		} else {
			const owned = await withExplicitUserScope(userId, (scopedDb) =>
				scopedDb
					.selectFrom("mixups")
					.select("id")
					.where("id", "=", mixupId)
					.executeTakeFirst(),
			);

			if (!owned) {
				return new Response("Mixup not found", { status: 404 });
			}
		}

		// Fetch mixup and its slots (join with recipes to get slug)
		const [mixup, slots] = await withExplicitUserScope(userId, (scopedDb) =>
			Promise.all([
				scopedDb
					.selectFrom("mixups")
					.selectAll()
					.where("id", "=", mixupId)
					.executeTakeFirst(),
				scopedDb
					.selectFrom("mixup_slots")
					.leftJoin("recipes", "recipes.id", "mixup_slots.recipe_id")
					.select([
						"mixup_slots.id",
						"mixup_slots.mixup_id",
						"mixup_slots.slot_id",
						"mixup_slots.recipe_id",
						"mixup_slots.order_index",
						"recipes.slug as resolved_slug",
					])
					.where("mixup_slots.mixup_id", "=", mixupId)
					.orderBy("mixup_slots.order_index", "asc")
					.execute(),
			]),
		);

		if (!mixup) {
			logger.warn(`Mixup not found: ${mixupId}`);
			return new Response("Mixup not found", { status: 404 });
		}

		const layout = getLayoutById(mixup.layout_id, width, height);
		if (!layout) {
			logger.warn(`Invalid layout for mixup ${mixupId}: ${mixup.layout_id}`);
			return new Response("Invalid layout", { status: 400 });
		}

		// Build slot assignments map, preferring the normalized recipe_id relation.
		const assignments: Record<string, string | null> = {};
		for (const slot of slots) {
			assignments[slot.slot_id] = slot.resolved_slug ?? null;
		}

		logger.info(
			`Rendering mixup ${mixupId} with layout ${mixup.layout_id} and ${slots.length} slots`,
		);

		const compositedPng = await renderMixupCompositePng(
			layout.slots,
			assignments,
			width,
			height,
			userId,
			$timezone,
		);
		// Dispatch on profile MIME — model/palette_id are URL query params, so
		// the same URL always picks the same renderer.
		const image =
			profile.model.mime_type === "image/bmp"
				? {
						buffer: await renderBmp(compositedPng, {
							ditheringMethod: DitheringMethod.ATKINSON,
							width,
							height,
							grayscale: grayscaleLevels,
						}),
						mime_type: "image/bmp",
						size_limit_exceeded: false,
					}
				: await renderDeviceImage({ png: compositedPng, profile });

		return imageResponse(image);
	} catch (error) {
		logger.error("Error generating mixup image:", error);
		const message =
			error instanceof Error ? error.message : "Error generating image";
		const image = await renderErrorImage({
			message,
		});
		return imageResponse(image, 500);
	}
}

function imageResponse(
	image: { buffer: Buffer; mime_type: string; size_limit_exceeded?: boolean },
	status = 200,
): Response {
	return new Response(new Uint8Array(image.buffer), {
		status,
		headers: {
			"Content-Type": image.mime_type,
			"Content-Length": image.buffer.length.toString(),
			...(image.size_limit_exceeded
				? { "X-TRMNL-Image-Size-Limit-Exceeded": "true" }
				: {}),
		},
	});
}

/**
 * Render a single recipe slot and return the PNG buffer
 */
async function renderSlot(
	slot: LayoutSlot,
	recipeSlug: string,
	userId: string,
	$timezone: string,
): Promise<Buffer | null> {
	try {
		const renders = await renderRecipeToImage({
			slug: recipeSlug,
			imageWidth: slot.width,
			imageHeight: slot.height,
			formats: [FormatValue.png],
			$timezone,
			userId,
		});
		return renders.png;
	} catch (error) {
		logger.error(
			`Error rendering slot ${slot.id} with recipe ${recipeSlug}:`,
			error,
		);
		return null;
	}
}

/**
 * Render all slots and composite them into a final PNG
 */
async function renderMixupCompositePng(
	slots: LayoutSlot[],
	assignments: Record<string, string | null>,
	width: number,
	height: number,
	userId: string,
	$timezone: string,
): Promise<Buffer> {
	// Render all slots in parallel
	const slotRenders = await Promise.all(
		slots.map(async (slot) => {
			const recipeSlug = assignments[slot.id];
			if (!recipeSlug) {
				return { slot, buffer: null };
			}

			const buffer = await renderSlot(slot, recipeSlug, userId, $timezone);
			return { slot, buffer };
		}),
	);

	// Build composite overlays
	const overlays: sharp.OverlayOptions[] = [];

	for (const { slot, buffer } of slotRenders) {
		if (!buffer) continue;

		try {
			// Resize the rendered slot to fit its position on the canvas
			const resizedSlot = await sharp(buffer)
				.resize(slot.width, slot.height, { fit: "cover" })
				.toBuffer();

			overlays.push({
				input: resizedSlot,
				left: slot.x,
				top: slot.y,
			});
		} catch (error) {
			logger.error(`Error resizing slot ${slot.id}:`, error);
		}
	}

	// Create the base canvas and composite all overlays
	const compositedPng = await sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 255, g: 255, b: 255 },
		},
	})
		.composite(overlays)
		.png()
		.toBuffer();

	return compositedPng;
}
