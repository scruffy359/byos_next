import { z } from "zod";
import type { RecipeDefinition } from "@/lib/recipes/types";
import { localTimezone } from "@/lib/utils";
import { PreSatori } from "@/utils/pre-satori";

const useDoubling = true;

export const paramsSchema = z.object({
	$timezone: z.string().default(localTimezone()),
});
export const dataSchema = paramsSchema.extend({ currentDtm: z.date() });

function getTimeParts(date: Date, $timezone: string) {
	const intlDateObjWeekday = new Intl.DateTimeFormat("en-US", {
		timeZone: $timezone,
		weekday: "long",
	});
	const intlDateObjDate = new Intl.DateTimeFormat("en-US", {
		timeZone: $timezone,
		month: "long",
		day: "numeric",
		year: "numeric",
	});
	const intlDateObjTime = new Intl.DateTimeFormat("en-US", {
		timeZone: $timezone,
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
	const weekdayParts = intlDateObjWeekday.formatToParts(date);
	const dayName =
		weekdayParts.find((part) => part.type === "weekday")?.value ?? "Unknown";
	const datePart = intlDateObjDate.format(date);
	const timePart = intlDateObjTime.format(date);
	return { dayName, datePart, timePart };
}

type PartFontSizes = {
	day: string;
	time: string;
	date: string;
};

// Tailwind responsive breakpoints used here: sm≥640, md≥768, lg≥1024, xl≥1280,
// 2xl≥1536. Tuned so the layout stays readable at 800×480 (TRMNL OG) and
// scales up cleanly at 1872×1404 (TRMNL X / e-readers) without scaling
// rasterized bitmap output.
const FONT_SCALE: Record<string, PartFontSizes> = {
	sm: { day: "text-8xl", time: "text-10xl", date: "text-8xl" },
	md: { day: "text-8xl", time: "text-[10rem]", date: "text-8xl" },
	lg: { day: "text-[10rem]", time: "text-[16rem]", date: "text-[10rem]" },
	xl: { day: "text-[10rem]", time: "text-[16rem]", date: "text-[10rem]" },
	"2xl": { day: "text-[10rem]", time: "text-[16rem]", date: "text-[10rem]" },
};

function fontSizesForWidth(width: number): PartFontSizes {
	if (width >= 1536) return FONT_SCALE["2xl"];
	if (width >= 1280) return FONT_SCALE.xl;
	if (width >= 1024) return FONT_SCALE.lg;
	return FONT_SCALE.md;
}

export default function Clock({
	width = 800,
	height = 480,
	$timezone,
	currentDtm,
}: {
	width?: number;
	height?: number;
	$timezone: string;
	currentDtm: Date;
}) {
	const parts = getTimeParts(currentDtm, $timezone);
	const isHalfScreen = width === 400 && height === 480;
	const fontSizes = fontSizesForWidth(width);
	return (
		<PreSatori width={width} height={height}>
			<div className="relative w-full h-full p-4 bg-black flex flex-col text-white">
				<div
					className={`w-full h-full flex p-4 items-center justify-between ${isHalfScreen ? "flex-col" : "flex-col sm:flex-col"}`}
				>
					<div className={`font-inter ${fontSizes.day} uppercase`}>
						{parts.dayName}
					</div>
					<div className={`font-inter ${fontSizes.time}`}>{parts.timePart}</div>
					<div className={`font-inter ${fontSizes.date}`}>{parts.datePart}</div>
				</div>
			</div>
		</PreSatori>
	);
}

export const definition: RecipeDefinition<
	typeof paramsSchema,
	typeof dataSchema
> = {
	meta: {
		slug: "clock",
		title: "Clock",
		description: "A large format clock",
		published: true,
		tags: ["bitmap", "clock"],
		author: { name: "Scott Schroeder", github: "tbd" },
		category: "display-components",
		version: "0.1.0",
		createdAt: "2026-06-12T00:00:00Z",
		updatedAt: "2026-06-12T00:00:00Z",
		renderSettings: { supersample: useDoubling },
	},
	paramsSchema,
	dataSchema,
	getData: async (params) => {
		const currentDtm = new Date();
		return { currentDtm, $timezone: params.$timezone } as z.infer<
			typeof dataSchema
		>;
	},
	Component: ({ width, height, data }) => (
		<Clock {...data} width={width} height={height} />
	),
};
