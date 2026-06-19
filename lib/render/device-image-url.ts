import type { DeviceProfile } from "@/lib/trmnl/device-profile";

const IMAGE_EXTENSION_PATTERN = /\.(bmp|png|webp|jpe?g)$/i;

const MIME_EXTENSION: Record<string, string> = {
	"image/bmp": "bmp",
	"image/png": "png",
	"image/webp": "webp",
};

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

export function buildDeviceImageFilename(
	imagePath: string,
	uniqueId: string,
	profile: DeviceProfile,
): string {
	return `${stripImageExtension(imagePath)}_${uniqueId}.${getImageFilenameExtension(profile)}`;
}

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
	$timezone: string | null;
	model: string | null;
	paletteId: string | null;
};

export function buildDeviceImageParameters({
	width,
	height,
	grayscale,
	$timezone,
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
	if ($timezone) {
		params.set("$timezone", $timezone);
	}
	// TODO: base64?
	// if (hints.base64) {
	// 	params.set("base64", "true");
	// }
	return params;
}
