import { revalidateTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import {
	getScreenParams,
	updateScreenParams,
} from "@/app/actions/screens-params";
import { setRenderAssociationCacheEntry } from "@/cache-handlers/render-association-cache-handler";
import { PageTemplate } from "@/components/common/page-template";
import { DeleteRecipeButton } from "@/components/recipes/delete-recipe-button";
import { RecipePreviewStage } from "@/components/recipes/recipe-preview-stage";
import RecipeProps from "@/components/recipes/recipe-props";
import { ScreenParamsForm } from "@/components/recipes/screen-params-form";
import { Badge } from "@/components/ui/badge";
import { getCurrentUserId } from "@/lib/auth/get-user";
import { withUserScope } from "@/lib/database/scoped-db";
import { checkDbConnection, isNoDbMode } from "@/lib/database/utils";
import { listAllRecipes } from "@/lib/recipes/catalog";
import {
	customFieldsToParamDefinitions,
	fetchLiquidRecipeSettings,
} from "@/lib/recipes/liquid-renderer";
import { getRendererType } from "@/lib/recipes/render/rasterize";
import { resolveReactRecipe } from "@/lib/recipes/runtime/react";
import { zodObjectToParamDefinitions } from "@/lib/recipes/zod-form";
import {
	RenderAssociationType,
	ResolvePreviewImageUrlParameters,
} from "@/lib/render/render-annotation-types";
import { createRenderAssociationValuesForSettings } from "@/lib/render/render-association";
import { listModels, listPalettes } from "@/lib/trmnl/registry";
import { FormatValue } from "@/lib/types";
import { configuredTimezone } from "@/lib/utils";

export async function generateMetadata() {
	return {};
}

export async function getPreviewImageUrl({
	screenId,
	modelName,
	paletteId,
	orientation,
}: ResolvePreviewImageUrlParameters): Promise<string> {
	"use server";
	const noDb = isNoDbMode();

	const userId = !noDb ? await getCurrentUserId() : null;

	if (!noDb && !userId) {
		throw Error("Current user could not be determined.");
	}

	const associationValues = await createRenderAssociationValuesForSettings({
		type: RenderAssociationType.recipePreview,
		screenId,
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

	// TODO: support direct width/height? or only side-effect of these params.
	setRenderAssociationCacheEntry(associationValues);

	return associationValues.imageUrl;
}

async function refreshData(slug: string) {
	"use server";
	await new Promise((resolve) => setTimeout(resolve, 500));
	console.log(`invalidate tag: ${slug}`);
	revalidateTag(slug, "max");
}

export async function generateStaticParams() {
	try {
		const recipes = await listAllRecipes();
		if (recipes.length > 0) {
			return recipes.map((recipe) => ({ slug: recipe.slug }));
		}
	} catch {
		// fall through
	}
	return [{ slug: "_" }];
}

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

function MetaChips({
	type,
	version,
	category,
	updatedAt,
}: {
	type?: string | null;
	version?: string | number | null;
	category?: string | null;
	updatedAt?: string | null;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5 text-xs">
			{type && (
				<Badge
					variant="outline"
					className="uppercase tracking-wider text-[10px]"
				>
					{type}
				</Badge>
			)}
			{version != null && version !== "" && (
				<Badge variant="secondary" className="tabular-nums">
					v{version}
				</Badge>
			)}
			{category && (
				<span className="rounded-md border bg-muted/40 px-2 py-0.5 capitalize text-muted-foreground">
					{String(category).replace(/-/g, " ")}
				</span>
			)}
			{updatedAt && (
				<span className="text-muted-foreground tabular-nums">
					Updated {new Date(updatedAt).toLocaleDateString()}
				</span>
			)}
		</div>
	);
}

function SectionCard({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-3">
			<div className="flex items-center gap-3">
				<h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
					{label}
				</h3>
				<div className="h-px flex-1 bg-border" />
			</div>
			{children}
		</section>
	);
}

const DefaultFormat = FormatValue.bmp;

export default async function RecipePage({
	params,
	searchParams,
}: {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ orientation?: string; format?: string }>;
}) {
	await connection();
	const { slug } = await params;
	const { orientation, format = DefaultFormat } = await searchParams;
	const formatValue = format as FormatValue;
	const isPortrait = orientation === "portrait";
	const $timezone = configuredTimezone();

	// React recipe path
	const resolved = await resolveReactRecipe(slug, $timezone, null);
	if (resolved) {
		const { definition, params: resolvedParams, data } = resolved;
		const meta = definition.meta;
		const paramDefinitions = zodObjectToParamDefinitions(
			definition.paramsSchema,
		);
		const hasParams = Object.keys(paramDefinitions).length > 0;
		const recipeProps = {
			data,
			params: hasParams ? resolvedParams : undefined,
		};

		const [trmnlModels, trmnlPalettes] = await Promise.all([
			listModels(),
			listPalettes(),
		]);

		return (
			<div className="@container">
				<PageTemplate
					title={
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
							<h1 className="text-2xl font-bold tracking-tight">
								{meta.title}
							</h1>
							<MetaChips
								type="react"
								version={meta.version}
								category={meta.category}
								updatedAt={meta.updatedAt}
							/>
						</div>
					}
					subtitle={
						<>
							{meta.description && (
								<p className="text-sm text-muted-foreground max-w-prose">
									{meta.description}
								</p>
							)}
							{meta.renderSettings?.supersample && (
								<p className="mt-1 text-xs text-muted-foreground max-w-prose">
									Supersampling enabled: image renders at 2× resolution, then
									downsamples to the selected device size.
								</p>
							)}
						</>
					}
					left={meta.system ? null : <DeleteRecipeButton slug={slug} />}
				>
					<RecipePreviewStage
						slug={slug}
						isPortrait={isPortrait}
						trmnlModels={trmnlModels}
						trmnlPalettes={trmnlPalettes}
						format={formatValue}
						getPreviewImageUrl={getPreviewImageUrl}
						bmpPipeline={
							<span>
								JSX → pre-satori → {getRendererType()} PNG → render-bmp →{" "}
								<Link href={`/api/bitmap/${slug}.bmp`}>
									/api/bitmap/{slug}.bmp
								</Link>
							</span>
						}
						pngPipeline={
							<span>
								JSX → pre-satori → {getRendererType()} PNG →{" "}
								<Link href={`/api/bitmap/${slug}.bmp`}>
									/api/bitmap/{slug}.bmp
								</Link>
							</span>
						}
						reactPipeline={
							<span>
								/recipes/screens/{slug}/{slug}.tsx
							</span>
						}
					/>

					{hasParams && (
						<ScreenParamsForm
							slug={slug}
							paramsSchema={paramDefinitions}
							initialValues={resolvedParams}
							updateAction={updateScreenParams}
						/>
					)}

					{definition.getData && (
						<SectionCard label="Data">
							<RecipeProps
								props={recipeProps}
								slug={slug}
								refreshAction={refreshData}
							/>
						</SectionCard>
					)}
				</PageTemplate>
			</div>
		);
	}

	// Liquid recipe path
	const liquidMeta = await fetchLiquidRecipeMeta(slug);
	if (!liquidMeta) notFound();

	const title = liquidMeta.name;
	const description = liquidMeta.description;

	const userId = await getCurrentUserId();
	const liquidSettings = await fetchLiquidRecipeSettings(slug, userId);
	const customFields = liquidSettings?.custom_fields ?? [];
	const paramDefinitions = customFieldsToParamDefinitions(customFields);
	const hasParams = Object.keys(paramDefinitions).length > 0;
	const storedValues = hasParams
		? await getScreenParams(slug, null, paramDefinitions, {})
		: {};
	const [trmnlModels, trmnlPalettes] = await Promise.all([
		listModels(),
		listPalettes(),
	]);

	return (
		<div className="@container">
			<PageTemplate
				title={
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
						<MetaChips
							type="liquid"
							version={liquidMeta.version}
							category={liquidMeta.category}
							updatedAt={
								liquidMeta.updated_at instanceof Date
									? liquidMeta.updated_at.toISOString()
									: liquidMeta.updated_at
							}
						/>
					</div>
				}
				subtitle={
					description ? (
						<p className="text-sm text-muted-foreground max-w-prose">
							{description}
						</p>
					) : null
				}
				left={<DeleteRecipeButton slug={slug} />}
			>
				<RecipePreviewStage
					slug={slug}
					isPortrait={isPortrait}
					trmnlModels={trmnlModels}
					trmnlPalettes={trmnlPalettes}
					simulateReactPreviewInIframe={false}
					format={formatValue}
					bmpPipeline={
						<span>
							Liquid → liquidjs → HTML → Puppeteer PNG → render-bmp →{" "}
							<Link href={`/api/bitmap/${slug}.bmp`}>
								/api/bitmap/{slug}.bmp
							</Link>
						</span>
					}
					pngPipeline={<span>Liquid → liquidjs → HTML → Puppeteer PNG</span>}
					reactPipeline={
						<span>Liquid → liquidjs → HTML → browser preview</span>
					}
					getPreviewImageUrl={getPreviewImageUrl}
				/>
				{hasParams && (
					<ScreenParamsForm
						slug={slug}
						paramsSchema={paramDefinitions}
						initialValues={storedValues}
						updateAction={updateScreenParams}
					/>
				)}
			</PageTemplate>
		</div>
	);
}
