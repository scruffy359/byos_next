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

function getStartOfDay(): Date {
	const startOfDay = new Date();
	startOfDay.setHours(0, 0, 0, 0);
	return startOfDay;
}

export default async function getUpcomingCalendarEventsData(
	params?: UpcomingCalendarEventsParams,
): Promise<UpcomingCalendarEventsData> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 8000);

	const baseUrl = params?.caldavUrl;
	const username = params?.caldavUsername;
	const apikey = params?.caldavApiKeySecret;

	if (!baseUrl || !apikey || !username) {
		return {
			status: ResponseStatus.error,
			message: "Invalid parameters",
			events: null,
		};
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

		const showCalendarName = "TRMNL";

		// List calendars
		const calendars = await client.getCalendars();

		const showCalendar = calendars.find(
			(value) => value.displayName === showCalendarName,
		);

		if (!showCalendar) {
			return {
				status: ResponseStatus.error,
				message: `Calendar with name '${showCalendarName}' not found.`,
				events: null,
			};
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
}
