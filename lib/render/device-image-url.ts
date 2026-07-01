import type { DeviceProfile } from "@/lib/trmnl/device-profile";

/** @deprecated */
const IMAGE_EXTENSION_PATTERN = /\.(bmp|png|webp|jpe?g)$/i;

const FileExtensionBmp = "bmp";
const FileExtensionPng = "png";
const FileExtensionWebp = "webp";

export enum SupportedMimeTypes {
	ImageBmp = "image/bmp",
	ImagePng = "image/png",
	ImageWebp = "image/webp",
}

export const DefaultImageMimeType = SupportedMimeTypes.ImageBmp;

// Create a reverse mapping object
const SupportedMimeTypesReverse: Record<string, SupportedMimeTypes> = {};
for (const key in SupportedMimeTypes) {
	const value = SupportedMimeTypes[key as keyof typeof SupportedMimeTypes];
	if (typeof value === "string") {
		SupportedMimeTypesReverse[value] = key as unknown as SupportedMimeTypes;
	}
}

const MIME_EXTENSION: Record<SupportedMimeTypes, string> = {
	[SupportedMimeTypes.ImageBmp]: FileExtensionBmp,
	[SupportedMimeTypes.ImagePng]: FileExtensionPng,
	[SupportedMimeTypes.ImageWebp]: FileExtensionWebp,
};

const FileExtensionToMimeType: Record<string, SupportedMimeTypes> = {
	[FileExtensionBmp]: SupportedMimeTypes.ImageBmp,
	[FileExtensionPng]: SupportedMimeTypes.ImagePng,
	[FileExtensionWebp]: SupportedMimeTypes.ImageWebp,
};

export const convertExtensionToMimeType = (
	extension: string,
): SupportedMimeTypes => {
	const result = FileExtensionToMimeType[extension];
	if (!result) {
		throw new Error(`File extenstion not supported: ${extension}`);
	}
	return result;
};

export function getImageFilenameExtensionFromMimeType(mimeType: string) {
	"use client";
	return (
		MIME_EXTENSION[mimeType as SupportedMimeTypes] ??
		mimeType.split("/").pop() ??
		FileExtensionPng
	);
}

export const getMimeTypeForProfile = (
	profile: DeviceProfile,
): SupportedMimeTypes => {
	const mimeType = profile.model.mime_type;
	const result = SupportedMimeTypesReverse[profile.model.mime_type];
	if (!result) {
		throw new Error(`Unsupported mime type: ${mimeType}`);
	}
	return result;
};

export function getImageFilenameExtension(profile: DeviceProfile): string {
	return (
		MIME_EXTENSION[profile.model.mime_type as SupportedMimeTypes] ??
		profile.model.mime_type.split("/").at(-1) ??
		FileExtensionPng
	);
}

/**
 *
 * @param imagePath
 * @returns
 */
export function stripImageExtension(imagePath: string): string {
	// TODO use find "." and remove instead of this
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
