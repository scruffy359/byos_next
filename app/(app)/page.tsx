import { connection } from "next/server";
import { Suspense } from "react";
import {
	createErrorRenderAssociationValuesForDevice,
	getCurrentScreenCacheEntry,
	getRenderAssociatedCacheEntry,
	RenderAssociationType,
	RenderAssociationValues,
	setRenderAssociationCacheEntry,
} from "@/cache-handlers/bitmap-association-cache-handler";
import { PageTemplate } from "@/components/common/page-template";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DatabaseSetupPanel } from "@/components/setup/database-setup-panel";
import { Badge } from "@/components/ui/badge";
import { getInitData } from "@/lib/getInitData";
import { Device } from "@/lib/types";
import DashboardClientPage from "./client-page";

const getCurrentScreenAssociation = async (
	device: Device,
): Promise<RenderAssociationValues> => {
	"use server";
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

// Dashboard data component that uses the cached data
const DashboardData = async () => {
	// Get data from the centralized getInitData
	// Since this is cached, it won't cause duplicate requests
	const { devices, systemLogs, dbStatus } = await getInitData();
	if (!dbStatus.ready) {
		return (
			<>
				<DatabaseSetupPanel dbStatus={dbStatus} />
				<DashboardSkeleton className="filter blur-[1px] pointer-events-none mt-6" />
			</>
		);
	}

	return (
		<DashboardClientPage
			devices={devices}
			systemLogs={systemLogs}
			getCurrentScreenAssociation={getCurrentScreenAssociation}
		/>
	);
};

export default async function Dashboard() {
	await connection();

	// Get minimal data for the header only
	const { dbStatus } = await getInitData();

	// Now we can safely use new Date() after accessing headers
	const currentHour = new Date().getHours();
	const greeting =
		currentHour < 12
			? "morning ☀️"
			: currentHour < 18
				? "afternoon ☕️"
				: "evening 🌙";

	return (
		<PageTemplate
			title={
				<h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
					Good {greeting}
					{!dbStatus.ready && (
						<Badge
							variant="outline"
							className="border-primary/30 bg-primary/10 text-primary"
						>
							noDB mode
						</Badge>
					)}
				</h1>
			}
		>
			<Suspense fallback={<DashboardSkeleton />}>
				<DashboardData />
			</Suspense>
		</PageTemplate>
	);
}
