"use server";

import {
	createErrorRenderAssociationValuesForDevice,
	getCurrentScreenCacheEntry,
	getRenderAssociatedCacheEntry,
	RenderAssociationType,
	RenderAssociationValues,
	setRenderAssociationCacheEntry,
} from "@/cache-handlers/render-association-cache-handler";
import { Device } from "../types";

export const getCurrentScreenAssociation = async (
	device: Device,
): Promise<RenderAssociationValues> => {
	const associationValues = await getCurrentScreenCacheEntry(
		device.friendly_id,
	);

	if (!associationValues) {
		const errorAssociationValues =
			await createErrorRenderAssociationValuesForDevice({
				type: RenderAssociationType.devicePreview,
				device,
				errorMessage: "Cannot display latest screen for device.",
			});

		setRenderAssociationCacheEntry(errorAssociationValues);

		return errorAssociationValues;
	}

	// ensure render cache entry exists
	const existingRenderValues = await getRenderAssociatedCacheEntry(
		associationValues.associationId,
	);

	// if not existings, set cache entry as it likely aged out.
	if (!existingRenderValues) {
		setRenderAssociationCacheEntry(associationValues);
	}

	return associationValues;
};
