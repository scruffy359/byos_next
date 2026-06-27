import { unstable_cache } from "next/cache";
import { CalDAVClient, Event } from "ts-caldav";
import { getDataFromFixture } from "./getDataFromFixture";

const fixtureFile: string | null = null; //"fixture-data-1.json";

type UpcomingCalendarEventsParams = {
	caldavUrl: string;
	caldavUsername: string;
	caldavApiKeySecret: string;
	calendarName: string;
	eventCountToDisplay: number;
};

export enum ResponseStatus {
	ok = "ok",
	error = "error",
}

export interface UpcomingCalendarEventsData {
	status: ResponseStatus;
	message?: string;
	events: Event[] | null;
}

const getStartOfDay = () => {
	const startOfDay = new Date();
	startOfDay.setHours(0, 0, 0, 0);
	return startOfDay;
};

const getUpcomingCalendarEventsData = async (
	params?: UpcomingCalendarEventsParams,
): Promise<UpcomingCalendarEventsData> => {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 8000);

	const baseUrl = params?.caldavUrl;
	const username = params?.caldavUsername;
	const apikey = params?.caldavApiKeySecret;
	const calendarName = params?.calendarName ?? "TRMNL";

	if (!baseUrl || !apikey || !username) {
		throw new Error("Invalid parameters", {
			cause: "upe-user-presentable",
		});
	}

	if (fixtureFile) {
		const events = await getDataFromFixture(fixtureFile);

		return {
			status: ResponseStatus.ok,
			events,
		};
	}

	try {
		const client = await CalDAVClient.create({
			baseUrl,
			auth: {
				type: "basic",
				username,
				password: apikey,
			},
		});

		// List calendars
		const calendars = await client.getCalendars();

		const showCalendar = calendars.find(
			(value) => value.displayName === calendarName,
		);

		if (!showCalendar) {
			throw new Error(`Calendar with name '${calendarName}' not found.`, {
				cause: "upe-user-presentable",
			});
		}

		// Fetch events
		const events = await client.getEvents(showCalendar.url, {
			start: getStartOfDay(),
		});

		const result = {
			status: ResponseStatus.ok,
			events,
		};

		return result;
	} finally {
		clearTimeout(timer);
	}
};

const fixCachedDate = (dateField: unknown) => {
	const t = typeof dateField;

	if (t === "object") {
		return new Date((dateField as object).toString());
	}

	if (t === "string") {
		return new Date(dateField as string);
	}

	return dateField as Date;
};

const fixSerializedCacheDates = (cachedData: UpcomingCalendarEventsData) => {
	if (cachedData.status !== ResponseStatus.ok) {
		return cachedData;
	}

	const { events } = cachedData;

	if (!events || events.length < 1) return cachedData;

	const fixedEvents = events.map((event) => {
		const start = fixCachedDate(event.start);
		const end = fixCachedDate(event.end);

		return { ...event, start, end };
	});

	return { ...cachedData, events: fixedEvents };
};

const getCachedData = unstable_cache(
	async (
		params?: UpcomingCalendarEventsParams,
	): Promise<UpcomingCalendarEventsData> => {
		return await getUpcomingCalendarEventsData(params);
	},
	["upcoming-calendar-events-data"],
	{
		tags: ["calendar", "caldav"],
		revalidate: 300, // Cache for 5 minutes
	},
);

/**
 * Fixes unstable_cache issue where Date objects are persisted as String.
 * Convert the fields that should be Date to be correct type.
 * @param params
 * @returns
 */
const getFixedCacheData = async (
	params?: UpcomingCalendarEventsParams,
): Promise<UpcomingCalendarEventsData> => {
	const cached = await getCachedData(params);
	return fixSerializedCacheDates(cached);
};

const getData = async (
	params?: UpcomingCalendarEventsParams,
): Promise<UpcomingCalendarEventsData> => {
	try {
		const cached = getFixedCacheData(params);
		return await cached;
	} catch (error) {
		console.error("Error fetching upcoming-calendar-events:", error);

		if (error instanceof Error) {
			if (error.cause === "")
				return {
					status: ResponseStatus.error,
					message: error.message,
					events: null,
				};
		}

		throw error;
	}
};

export default getData;
