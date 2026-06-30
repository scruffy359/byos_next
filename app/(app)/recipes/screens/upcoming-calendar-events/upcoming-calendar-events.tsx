import { z } from "zod";
import {
	DEFAULT_IMAGE_HEIGHT,
	DEFAULT_IMAGE_WIDTH,
} from "@/lib/recipes/constants";
import type { RecipeDefinition } from "@/lib/recipes/types";
import { createScreenProfile, ScreenProfile } from "@/lib/trmnl/screen-profile";
import { configuredTimezone } from "@/lib/utils";
import { PreSatori } from "@/utils/pre-satori";
import getUpcomingCalendarEventsData, {
	ResponseStatus,
	UpcomingCalendarEventsData,
} from "./getData";

const useDoubling = true;

const UrlICloud = "https://caldav.icloud.com";

export const paramsSchema = z.object({
	caldavUrl: z.enum([UrlICloud]).default(UrlICloud),
	caldavUsername: z.email().nonempty(),
	caldavApiKeySecret: z.string().nonempty(),
	calendarName: z.string().nonempty().default("TRMNL"),
	eventCountToDisplay: z.int().default(3),
	$timezone: z.string().default(configuredTimezone()),
});

export const dataSchema = z.object({
	status: z.any(),
	message: z.optional(z.string()),
	events: z.nullable(z.array(z.any())),
});

type FormattedEventDate = {
	date: string;
	time: string;
	relative: string | null;
};

function formatEventDate(date: Date, timezone: string): FormattedEventDate {
	const locale = "en-US";
	const now = new Date();

	const dateParts = new Intl.DateTimeFormat(locale, {
		timeZone: timezone,
		month: "short",
		day: "2-digit",
	}).formatToParts(date);
	const month = dateParts.find((p) => p.type === "month")?.value ?? "";
	const day = dateParts.find((p) => p.type === "day")?.value ?? "";

	const time = new Intl.DateTimeFormat(locale, {
		timeZone: timezone,
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(date);

	// formats as YYYY-MM-DD, which parses as UTC midnight for clean day diffing
	const toDateString = (d: Date) =>
		new Intl.DateTimeFormat(locale, {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(d);

	const diffDays = Math.round(
		(new Date(toDateString(date)).getTime() -
			new Date(toDateString(now)).getTime()) /
			(1000 * 60 * 60 * 24),
	);

	const relative =
		diffDays > 0 && diffDays < 7
			? `in ${diffDays} day${diffDays === 1 ? "" : "s"}`
			: null;

	return { date: `${month} ${day}`, time, relative };
}

type UpcomingCalendarEventsParams = {
	params?: {
		$timezone: string;
		eventCountToDisplay: number;
	};
};

type UpcomingCalendarEventsProps = UpcomingCalendarEventsData &
	UpcomingCalendarEventsParams & {
		width?: number;
		height?: number;
		screen?: ScreenProfile;
	};

export default function UpcomingCalendarEvents({
	width: renderWidth = DEFAULT_IMAGE_WIDTH,
	height: renderHeight = DEFAULT_IMAGE_HEIGHT,
	screen,
	params,
	status,
	message,
	events,
}: UpcomingCalendarEventsProps) {
	const screenProfile =
		screen ?? createScreenProfile({ width: renderWidth, height: renderHeight });
	// The grid is coordinate-positioned (event top = time→y, left = day*colWidth),
	// so it is inherently measurement-based rather than Tailwind/flow layout.
	// Recipe dimensions are logical screen units, so TRMNL X scales from 1040px
	// logical width instead of its 1872px physical output.
	const width = screenProfile.logicalWidth;
	const height = screenProfile.logicalHeight;

	if (status !== ResponseStatus.ok) {
		return (
			<PreSatori width={width} height={height}>
				<div className="relative w-full h-full p-4 bg-black flex flex-col text-white">
					<div
						className={`w-full h-full flex p-4 justify-between flex-col sm:flex-col`}
					>
						<div className="font-inter text-[1.5vw]">Upcoming Events</div>
						<div className="font-inter text-[3vw] grow m-5">
							Error: {message}
						</div>
					</div>
				</div>
			</PreSatori>
		);
	}

	const eventCount = events?.length ?? 0;

	const eventCountToDisplay = params?.eventCountToDisplay ?? 0;
	const hasEvents = eventCount > 0;
	const remainingEventCount =
		eventCount > eventCountToDisplay ? eventCount - eventCountToDisplay : 0;
	const displayEvents = events ? events.slice(0, eventCountToDisplay) : [];

	// TODO: all-day vs date
	// TODO: date -> show as MM/DD, if within 7 days include "in X days".
	return (
		<PreSatori width={width} height={height}>
			<div className="relative w-full h-full p-4 bg-black flex flex-col text-white">
				<div
					className={`w-full h-full flex p-4 justify-between flex-col sm:flex-col`}
				>
					<div className="font-inter text-[1.5vw]">Upcoming Events</div>
					<div className="grow mt-4">
						{hasEvents &&
							displayEvents?.map((event, index) => {
								const formattedDate = formatEventDate(
									event.start,
									event.startTzid || configuredTimezone(),
								);
								return (
									<div key={index}>
										<div className="border border-solid rounded-md border-white mt-1 p-2">
											<div className="flex flex-column">
												<div className="grow">
													<div className="font-inter text-[2vw]">
														{event.summary}
													</div>
													{event.location && (
														<div className="font-inter text-[1.25vw]">
															Location: {event.location}
														</div>
													)}
													{event.description && (
														<div className="font-inter text-[1.25vw]">
															Notes: {event.description}
														</div>
													)}
												</div>
												<div className="text-center p-1">
													<div className="font-inter text-[1.5vw]">
														{formattedDate.date}
													</div>
													<div className="font-inter text-[1.5vw]">
														{formattedDate.time}
													</div>
													{formattedDate.relative && (
														<div className="font-inter text-[1.5vw]">
															{formattedDate.relative}
														</div>
													)}
												</div>
											</div>
										</div>
									</div>
								);
							})}
					</div>
					{remainingEventCount > 0 && (
						<div className="font-inter text-[2vw] text-right">
							{remainingEventCount} future events
						</div>
					)}
					{!hasEvents && (
						<div className="font-inter text-[2vw] text-right">No events</div>
					)}
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
		slug: "upcoming-calendar-events",
		title: "Upcoming Calendar Events",
		description: "Show CalDav upcoming events",
		published: true,
		tags: ["calendar", "caldav"],
		author: { name: "Scott Schroeder", github: "tbd" },
		category: "calendar",
		version: "0.1.0",
		createdAt: "2026-06-25T00:00:00Z",
		updatedAt: "2026-06-25T00:00:00Z",
		renderSettings: { supersample: useDoubling },
	},
	paramsSchema,
	dataSchema,
	getData: async (params) => {
		const data = await getUpcomingCalendarEventsData(params);
		return data as z.infer<typeof dataSchema>;
	},

	Component: ({ width, height, data, params, screen }) => (
		<UpcomingCalendarEvents
			{...data}
			params={params}
			width={width}
			height={height}
			screen={screen}
		/>
	),
};
