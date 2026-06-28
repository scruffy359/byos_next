import { CalDAVClient } from "ts-caldav";

(async () => {
	try {
		const client = await CalDAVClient.create({
			// baseUrl: "https://caldav.example.com",
			baseUrl: "https://caldav.icloud.com",
			auth: {
				type: "basic",
				username: "myuser",
				password: "mypassword",
			},
		});

		const showCalendarName = "TRMNL";

		// List calendars
		const calendars = await client.getCalendars();

		const showCalendar = calendars.find(
			(value) => value.displayName === showCalendarName,
		);

		if (!showCalendar) {
			console.error(`Calender with name '${showCalendarName}' not found.`);
			return;
		}

		// Fetch events
		const events = await client.getEvents(showCalendar.url, {
			start: new Date(),
		});

		console.log(JSON.stringify(events, undefined, 2));
	} catch (error) {
		if (error instanceof Error) {
			console.error("❌ Error getting CALDAV events:", error.message);
		}
		process.exit(1);
	}
})();
