import { notFound } from "next/navigation";
import { Suspense } from "react";
import { setRenderAssociationCacheEntry } from "@/cache-handlers/render-association-cache-handler";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUserId } from "@/lib/auth/get-user";
import { isNoDbMode } from "@/lib/database/utils";
import { getInitData } from "@/lib/getInitData";
import { listAllRecipes } from "@/lib/recipes/catalog";
import {
	createErrorRenderAssociationValuesForDevice,
	createRenderAssociationValuesForDevice,
} from "@/lib/render/render-association";
import {
	FunctionGetPreviewScreenArgs,
	RenderAssociationType,
} from "@/lib/render/render-association-types";
import { listModels, listPalettes } from "@/lib/trmnl/registry";
import { DeviceDisplayMode } from "@/lib/types";
import { getDeviceStatus } from "@/utils/helpers";
import DeviceClientPage from "./client-page";

export const getDevicePreviewScreenUrls = async (
	values: FunctionGetPreviewScreenArgs,
): Promise<string[]> => {
	"use server";

	const noDb = isNoDbMode();

	const userId = !noDb ? await getCurrentUserId() : null;

	if (!noDb && !userId) {
		throw Error("Current user could not be determined.");
	}

	const { device, playlistScreens, renderSettings } = values;
	const { modelName, paletteId, orientation } = renderSettings;
	const isPlaylist = device.display_mode === DeviceDisplayMode.PLAYLIST;
	const isMixup = device.display_mode === DeviceDisplayMode.MIXUP;

	if (isPlaylist) {
		if (!device.playlist_id) {
			const errorAssociationValues =
				await createErrorRenderAssociationValuesForDevice({
					type: RenderAssociationType.devicePreview,
					device,
					errorMessage: "Device's playlist is not set",
				});

			setRenderAssociationCacheEntry(errorAssociationValues);

			return [errorAssociationValues.imageUrl];
		}

		return Promise.all(
			playlistScreens.map(async (playlistScreen) => {
				if (!playlistScreen.screen) {
					const errorAssociationValues =
						await createErrorRenderAssociationValuesForDevice({
							type: RenderAssociationType.devicePreview,
							device,
							errorMessage: "Playlist item has no screen",
						});

					setRenderAssociationCacheEntry(errorAssociationValues);

					return errorAssociationValues.imageUrl;
				}
				const associationValues = await createRenderAssociationValuesForDevice({
					type: RenderAssociationType.devicePreview,
					screenId: playlistScreen.screen,
					device,
					renderSettings: {
						modelName,
						paletteId,
						orientation,
					},
					recipePreview: {
						userId,
					},
					dataParams: null,
				});

				setRenderAssociationCacheEntry(associationValues);

				return associationValues.imageUrl;
			}),
		);
	}

	if (isMixup) {
		if (!device.mixup_id) {
			const errorAssociationValues =
				await createErrorRenderAssociationValuesForDevice({
					type: RenderAssociationType.devicePreview,
					device,
					errorMessage: "Device's mixup is not set",
				});

			setRenderAssociationCacheEntry(errorAssociationValues);

			return [errorAssociationValues.imageUrl];
		}
		const associationValues = await createRenderAssociationValuesForDevice({
			type: RenderAssociationType.recipePreview,
			screenId: `mixup/${device.mixup_id}`,
			device,
			renderSettings: {
				modelName,
				paletteId,
				orientation,
			},
			recipePreview: {
				userId,
			},
			dataParams: null,
		});

		setRenderAssociationCacheEntry(associationValues);

		return [associationValues.imageUrl];
	}

	if (!device.screen) {
		const errorAssociationValues =
			await createErrorRenderAssociationValuesForDevice({
				type: RenderAssociationType.devicePreview,
				device,
				errorMessage: "Device screen is not configured",
			});

		setRenderAssociationCacheEntry(errorAssociationValues);

		return [errorAssociationValues.imageUrl];
	}

	const associationValues = await createRenderAssociationValuesForDevice({
		type: RenderAssociationType.recipePreview,
		screenId: device.screen,
		device,
		renderSettings: {
			modelName,
			paletteId,
			orientation,
		},
		recipePreview: {
			userId,
		},
		dataParams: null,
	});

	setRenderAssociationCacheEntry(associationValues);

	return [associationValues.imageUrl];
};

// Loading fallback for the device page
const DevicePageSkeleton = () => (
	<div className="space-y-6">
		<div className="flex items-center justify-between">
			<div className="space-y-1">
				<Skeleton className="h-8 w-64 rounded-md" />
				<Skeleton className="h-4 w-32 rounded-md" />
			</div>
			<div className="flex items-center gap-3">
				<Skeleton className="h-9 w-24 rounded-md" />
				<Skeleton className="h-9 w-24 rounded-md" />
			</div>
		</div>

		<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
			<Skeleton className="h-[400px] w-full rounded-md" />
			<div className="space-y-4">
				<Skeleton className="h-10 w-full rounded-md" />
				<Skeleton className="h-10 w-full rounded-md" />
				<Skeleton className="h-10 w-full rounded-md" />
				<Skeleton className="h-10 w-full rounded-md" />
			</div>
		</div>

		<Skeleton className="h-[300px] w-full rounded-md" />
	</div>
);

// Device data component that uses centralized cached data
const DeviceData = async ({ friendlyId }: { friendlyId: string }) => {
	const [
		{ devices, playlists, playlistItems, mixups },
		recipes,
		trmnlModels,
		trmnlPalettes,
	] = await Promise.all([
		getInitData(),
		listAllRecipes(),
		listModels(),
		listPalettes(),
	]);

	// Find the specific device by friendly_id
	const device = devices.find((d) => d.friendly_id === friendlyId);

	if (!device) {
		return notFound();
	}

	// Enhance device with status
	const enhancedDevice = {
		...device,
		status: getDeviceStatus(device),
	};

	// Convert renderable recipe catalog rows to screen dropdown options.
	const availableScreens = recipes.map((recipe) => ({
		id: recipe.slug,
		title: recipe.name,
	}));

	return (
		<DeviceClientPage
			initialDevice={enhancedDevice}
			availableScreens={availableScreens}
			availablePlaylists={playlists}
			availableMixups={mixups}
			playlistItems={playlistItems}
			trmnlModels={trmnlModels}
			trmnlPalettes={trmnlPalettes}
			getScreenUrls={getDevicePreviewScreenUrls}
		/>
	);
};

export default async function DevicePage({
	params,
}: {
	params: Promise<{ friendly_id: string }>;
}) {
	const resolvedParams = await params;
	const friendlyId = resolvedParams.friendly_id as string;

	return (
		<Suspense fallback={<DevicePageSkeleton />}>
			<DeviceData friendlyId={friendlyId} />
		</Suspense>
	);
}
