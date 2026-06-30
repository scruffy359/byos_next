import { connection, type NextRequest } from "next/server";
import { cache } from "react";
import { getRenderAssociatedCacheEntry } from "@/cache-handlers/render-association-cache-handler";
import {
	DEFAULT_IMAGE_HEIGHT,
	DEFAULT_IMAGE_WIDTH,
} from "@/lib/recipes/constants";
import { logger } from "@/lib/recipes/logger";
import {
	renderRecipeForDevice,
	renderRecipeToImage,
} from "@/lib/recipes/recipe-renderer";
import { stripImageExtension } from "@/lib/render/device-image-url";
import { renderErrorImage } from "@/lib/render/error-image";
import {
	parseImageRequest,
	rejectOversizedImageArea,
} from "@/lib/render/image-request";
import {
	resolveAssociationData,
	resolveDeviceProfile,
} from "@/lib/render/render-association";
import { RenderAssociationType } from "@/lib/render/render-association-types";
import {
	DEFAULT_MODEL_NAME,
	type DeviceProfile,
	getDeviceProfile,
} from "@/lib/trmnl/device-profile";
import { FormatValue } from "@/lib/types";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ slug?: string[] }> },
) {
	await connection();
	try {
		// Always await params as required by Next.js 14/15
		// TODO: handle error scenarios.
		const { slug = ["error"] } = await params;
		const bitmapPath = Array.isArray(slug) ? slug.join("/") : slug;
		const recipeAssociationSlug = stripImageExtension(bitmapPath);
		const splitDots = recipeAssociationSlug.split(".");
		const associationId = splitDots[splitDots.length - 1];
		let recipeSlug = splitDots.slice(0, -1).join(".");

		const { searchParams } = new URL(req.url);
		const imageRequest = parseImageRequest(searchParams);
		if (imageRequest instanceof Response) return imageRequest;

		const associatedValues = await getRenderAssociatedCacheEntry(associationId);

		console.log("GET /api/bitmap", {
			recipeSlug,
			associationId,
			associatedValues,
		});

		if (associatedValues === null) {
			throw new Error(
				`Screen cannot be found for Association ID: ${associationId}`,
			);
		}

		const {
			screenId,
			type: associationType,
			device: associationDevice,
			dataParams,
		} = associatedValues;

		logger.info(
			`Bitmap request for: '${bitmapPath}', screen '${screenId}' with ${imageRequest.grayscaleLevels} gray levels`,
		);

		if (
			associationType === RenderAssociationType.display &&
			!associationDevice
		) {
		}

		recipeSlug = screenId;

		// Resolve the device owner so recipe parameters are scoped to proper user.
		const resolvedData = await resolveAssociationData(associatedValues);
		if (!resolvedData) {
			throw new Error("Required data could not be resolved");
		}
		const { userId, device, internalValues } = resolvedData;

		// Forward cookies so browser rendering can reuse the caller's auth session.
		const cookieHeader = req.headers.get("cookie"); // TODO: is this needed? as cookies aren't really TRMNL

		const profile = await resolveDeviceProfile(device);

		if (recipeSlug === "error") {
			const imageWidth = imageRequest.width ?? profile.model.width;
			const imageHeight = imageRequest.height ?? profile.model.height;
			const oversized = rejectOversizedImageArea(imageWidth, imageHeight);
			if (oversized) return oversized;

			// TODO: error processing
			const errorMessage =
				(dataParams?.errorMessage as string) ??
				"An unknown display error has occurred.";
			const image = await renderErrorImage({
				message: errorMessage,
				width: imageWidth,
				height: imageHeight,
				grayscale: imageRequest.grayscaleLevels,
				profile,
			});
			return new Response(new Uint8Array(image.buffer), {
				headers: getImageResponseHeaders(image),
			});
		}

		// Profile + extension are both pinned by the URL (model and palette_id
		// are query params), so dispatch on profile MIME alone.
		if (profile.model.mime_type !== "image/bmp") {
			const imageWidth = profile.model.width;
			const imageHeight = profile.model.height;
			const oversized = rejectOversizedImageArea(imageWidth, imageHeight);
			if (oversized) return oversized;
			const image = await renderRecipeForDevice({
				slug: recipeSlug,
				profile,
				width: imageWidth,
				height: imageHeight,
				userId,
				$timezone: internalValues.$timezone,
				cookies: cookieHeader || undefined,
			});

			if (!image?.buffer.length) {
				logger.warn(`Failed to generate device image for ${recipeSlug}`);
				const errorImage = await renderErrorImage({
					message: `Could not render ${recipeSlug}`,
					width: imageWidth,
					height: imageHeight,
					grayscale: imageRequest.grayscaleLevels,
					profile,
				});
				return new Response(new Uint8Array(errorImage.buffer), {
					status: 500,
					headers: getImageResponseHeaders(errorImage),
				});
			}

			return new Response(new Uint8Array(image.buffer), {
				headers: getImageResponseHeaders(image),
			});
		}

		const validWidth = imageRequest.width ?? DEFAULT_IMAGE_WIDTH;
		const validHeight = imageRequest.height ?? DEFAULT_IMAGE_HEIGHT;
		const oversized = rejectOversizedImageArea(validWidth, validHeight);
		if (oversized) return oversized;
		// TODO: convert to field passing
		const recipeBuffer = await renderRecipeBitmap(
			recipeSlug,
			validWidth,
			validHeight,
			imageRequest.grayscaleLevels,
			profile,
			userId,
			internalValues.$timezone,
			cookieHeader || undefined,
		);

		if (
			!recipeBuffer ||
			!(recipeBuffer instanceof Buffer) ||
			recipeBuffer.length === 0
		) {
			logger.warn(`Failed to generate bitmap for ${recipeSlug}`);
			const errorImage = await renderErrorImage({
				message: `Could not render ${recipeSlug}`,
				width: validWidth,
				height: validHeight,
				grayscale: imageRequest.grayscaleLevels,
			});
			return new Response(new Uint8Array(errorImage.buffer), {
				status: 500,
				headers: getImageResponseHeaders(errorImage),
			});
		}

		return new Response(new Uint8Array(recipeBuffer), {
			headers: {
				"Content-Type": "image/bmp",
				"Content-Length": recipeBuffer.length.toString(),
			},
		});
	} catch (error) {
		logger.error("Error generating image:", error);
		const { searchParams } = new URL(req.url);
		const imageRequest = parseImageRequest(searchParams);
		const width =
			imageRequest instanceof Response
				? DEFAULT_IMAGE_WIDTH
				: (imageRequest.width ?? DEFAULT_IMAGE_WIDTH);
		const height =
			imageRequest instanceof Response
				? DEFAULT_IMAGE_HEIGHT
				: (imageRequest.height ?? DEFAULT_IMAGE_HEIGHT);
		const profile =
			imageRequest instanceof Response ? null : await resolveProfileForError();
		const errorImage = await renderErrorImage({
			message: error instanceof Error ? error.message : "Image render failed",
			width,
			height,
			grayscale:
				imageRequest instanceof Response
					? undefined
					: imageRequest.grayscaleLevels,
			profile,
		});
		return new Response(new Uint8Array(errorImage.buffer), {
			status: 500,
			headers: getImageResponseHeaders(errorImage),
		});
	}
}

const resolveProfileForError = async () => {
	return await getDeviceProfile(DEFAULT_MODEL_NAME, null);
};

function getImageResponseHeaders(image: {
	buffer: Buffer;
	mime_type: string;
	size_limit_exceeded?: boolean;
}) {
	return {
		"Content-Type": image.mime_type,
		"Content-Length": image.buffer.length.toString(),
		...(image.size_limit_exceeded
			? { "X-TRMNL-Image-Size-Limit-Exceeded": "true" }
			: {}),
	};
}

const renderRecipeBitmap = cache(
	async (
		recipeId: string,
		width: number,
		height: number,
		grayscaleLevels: number = 2,
		profile: DeviceProfile | null = null,
		userId: string | null = null,
		$timezone: string,
		cookies?: string,
	) => {
		const renders = await renderRecipeToImage({
			slug: recipeId,
			imageWidth: width,
			imageHeight: height,
			formats: [FormatValue.bmp],
			grayscale: grayscaleLevels,
			model: profile?.model ?? null,
			palette: profile?.palette ?? null,
			paletteId: profile?.palette?.id ?? null,
			userId,
			$timezone,
			cookies,
		});
		return renders.bitmap ?? Buffer.from([]);
	},
);
