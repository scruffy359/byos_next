import type { DeviceProfile } from "@/lib/trmnl/device-profile";

const IMAGE_EXTENSION_PATTERN = /\.(bmp|png|webp|jpe?g)$/i;

const MIME_EXTENSION: Record<string, string> = {
	"image/bmp": "bmp",
	"image/png": "png",
	"image/webp": "webp",
};

export function getImageFilenameExtensionFromMimeType(mimeType: string) {
	"use client";
	return MIME_EXTENSION[mimeType] ?? mimeType.split("/").pop() ?? "png";
}

export function getImageFilenameExtension(profile: DeviceProfile): string {
	return (
		MIME_EXTENSION[profile.model.mime_type] ??
		profile.model.mime_type.split("/").at(-1) ??
		"bin"
	);
}

export function stripImageExtension(imagePath: string): string {
	return imagePath.replace(IMAGE_EXTENSION_PATTERN, "");
}

/**
 * @deprecated After upgrade to Render Cache.
 */
export function buildDeviceImageFilename(
	imagePath: string,
	uniqueId: string,
	profile: DeviceProfile,
): string {
	return `${stripImageExtension(imagePath)}_${uniqueId}.${getImageFilenameExtension(profile)}`;
}

/**
 * @deprecated After upgrade to Render Cache.
 */
export function buildDeviceImageUrl({
	baseUrl,
	imagePath,
	profile,
	query,
}: {
	baseUrl: string;
	imagePath: string;
	profile: DeviceProfile;
	query?: string;
}): string {
	const normalizedPath = stripImageExtension(imagePath);
	const extension = getImageFilenameExtension(profile);
	const suffix = query ? `?${query}` : "";

	return `${baseUrl}/${normalizedPath}.${extension}${suffix}`;
}
/**
 * @deprecated After upgrade to Render Cache.
 */
export function buildDeviceImageUrlWithImageType({
	baseUrl,
	imagePath,
	screenName,
	imageType,
	query,
}: {
	baseUrl: string | null;
	imagePath: string;
	screenName: string;
	imageType: string;
	query?: string;
}): string {
	const normalizedScreenPath = stripImageExtension(screenName);
	const suffix = query ? `?${query}` : "";

	return `${baseUrl}/${imagePath}/${normalizedScreenPath}.${imageType}${suffix}`;
}

type DeviceRenderOptions = {
	width: number;
	height: number;
	grayscale: number | null;
	model: string | null;
	paletteId: string | null;
};

/**
 * @deprecated After upgrade to Render Cache.
 */
export function buildDeviceImageParameters({
	width,
	height,
	grayscale,
	model,
	paletteId,
}: DeviceRenderOptions) {
	const params = new URLSearchParams({
		width: String(width),
		height: String(height),
		grayscale: String(grayscale),
	});

	if (model) {
		params.set("model", model);
	}
	if (paletteId) {
		params.set("palette_id", paletteId);
	}
	// TODO: base64?
	// if (hints.base64) {
	// 	params.set("base64", "true");
	// }
	return params;
}
