import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, use } from "react";
import { getScreenParams } from "@/app/actions/screens-params";
import { withUserScope } from "@/lib/database/scoped-db";
import { checkDbConnection } from "@/lib/database/utils";
import LiquidPreview from "@/lib/recipes/liquid-preview";
import {
	customFieldsToParamDefinitions,
	fetchLiquidRecipeSettings,
	renderLiquidRecipe,
} from "@/lib/recipes/liquid-renderer";
import { consumeBrowserRenderContext } from "@/lib/recipes/render/browser-context";
import { getRenderScale } from "@/lib/recipes/render/settings";
import { resolveReactRecipe } from "@/lib/recipes/runtime/react";
import { getDeviceProfile } from "@/lib/trmnl/device-profile";
import {
	getTrmnlModelClassName,
	getTrmnlModelStyle,
} from "@/lib/trmnl/model-css";

import { FormatValue } from "@/lib/types";
import { localTimezone } from "@/lib/utils";

const fetchLiquidRecipeMeta = cache(async (slug: string) => {
	const { ready } = await checkDbConnection();
	if (!ready) return null;

	const recipe = await withUserScope(async (scopedDb) => {
		return scopedDb
			.selectFrom("recipes")
			.select(["name", "description", "category", "version", "updated_at"])
			.where("slug", "=", slug)
			.where("type", "=", "liquid")
			.executeTakeFirst();
	});

	return recipe ?? null;
});

function ScaledToFit({
	imageWidth,
	imageHeight,
	children,
}: {
	imageWidth: number;
	imageHeight: number;
	children: React.ReactNode;
}) {
	return (
		<div
			className="absolute inset-0"
			style={{ containerType: "inline-size" } as React.CSSProperties}
		>
			<div
				style={{
					width: `${imageWidth}px`,
					height: `${imageHeight}px`,
					transform: `scale(calc(100cqi / ${imageWidth}px))`,
					transformOrigin: "top left",
				}}
			>
				{children}
			</div>
		</div>
	);
}

function EmptyState({ children }: { children: React.ReactNode }) {
	return (
		<div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
			{children}
		</div>
	);
}

const LiquidRenderComponent = ({
	slug,
	format,
	imageWidth,
	imageHeight,
	customFieldOverrides,
	userId,
}: {
	slug: string;
	format: FormatValue;
	imageWidth: number;
	imageHeight: number;
	customFieldOverrides?: Record<string, unknown>;
	userId: string | null;
}) => {
	/*
	console.log({
		where: "LiquidRenderComponent",
		format,
		useClient: typeof window !== "undefined",
	});
	*/
	const result = use(renderLiquidRecipe(slug, userId, customFieldOverrides));

	if (!result) {
		return <EmptyState>Failed to render liquid template</EmptyState>;
	}

	if (format === FormatValue.react) {
		return (
			<ScaledToFit imageWidth={imageWidth} imageHeight={imageHeight}>
				<LiquidPreview
					html={result.html}
					width={imageWidth}
					height={imageHeight}
				/>
			</ScaledToFit>
		);
	}

	return null;
};

export default async function RecipePreviewPage({
	params,
	searchParams,
}: {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{
		format?: string;
		width?: string;
		height?: string;
		model?: string;
		palette_id?: string;
		render_token?: string;
		$timezone?: string;
	}>;
}) {
	await connection();
	const { slug } = await params;
	const {
		width: widthParam,
		height: heightParam,
		model: modelParam,
		palette_id: paletteParam,
		render_token: renderToken,
		$timezone: $timezoneParam,
	} = await searchParams;
	const userId = consumeBrowserRenderContext(renderToken);
	/*
	console.log({
		where: "RecipePreviewPage",
		userId,
		slug,
		$timezoneParam,
		useClient: typeof window !== "undefined",
	});
	*/

	const resolved = await resolveReactRecipe(
		slug,
		$timezoneParam ?? localTimezone(),
		null,
	);
	const width = widthParam ? Number.parseInt(widthParam, 10) : 800;
	const height = heightParam ? Number.parseInt(heightParam, 10) : 480;
	if (resolved) {
		const { definition, params: parsedParams, data } = resolved;
		const Component = definition.Component;
		const renderScale = getRenderScale(definition.meta.renderSettings ?? null);

		const profile =
			modelParam || paletteParam
				? await getDeviceProfile(modelParam, paletteParam)
				: null;
		const className = getTrmnlModelClassName(profile?.model);
		const style = getTrmnlModelStyle(profile?.model);

		const recipe = (
			<Component
				width={width}
				height={height}
				params={parsedParams}
				data={data}
			/>
		);
		const rendered =
			renderScale === 1 ? (
				recipe
			) : (
				<div
					style={{
						display: "flex",
						width,
						height,
						transform: `scale(${renderScale})`,
						transformOrigin: "top left",
					}}
				>
					{recipe}
				</div>
			);
		if (!className && !style) return rendered;
		return (
			<div
				className={className || undefined}
				style={{
					width: width ? width * renderScale : undefined,
					height: height ? height * renderScale : undefined,
					display: "flex",
					...style,
				}}
			>
				{rendered}
			</div>
		);
	}

	// Liquid recipe path
	const liquidMeta = await fetchLiquidRecipeMeta(slug);
	if (!liquidMeta) notFound();

	const liquidSettings = await fetchLiquidRecipeSettings(slug, userId);
	const customFields = liquidSettings?.custom_fields ?? [];
	const paramDefinitions = customFieldsToParamDefinitions(customFields);
	const hasParams = Object.keys(paramDefinitions).length > 0;
	const storedValues = hasParams
		? // TODO: internalValues
			await getScreenParams(slug, null, paramDefinitions, {})
		: {};

	return (
		<LiquidRenderComponent
			slug={slug}
			format={FormatValue.react}
			imageWidth={width}
			imageHeight={height}
			customFieldOverrides={storedValues}
			userId={userId}
		/>
	);
}
