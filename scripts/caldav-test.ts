import { CalDAVClient } from "ts-caldav";

(async () => {
	try {
		const client = await CalDAVClient.create({
			// baseUrl: "https://caldav.example.com",
			baseUrl: "https://caldav.icloud.com",
			auth: {
				type: "basic",
				// username: "myuser",
				// password: "mypassword",
				username: "scrufmeister@icloud.com",
				password: "owzy-crvv-vkoj-btlp",
			},
		});

		const showCalendarName = "TRMNL";
		const showEventsCount = 4;

		// List calendars
		const calendars = await client.getCalendars();
		console.log({ calendars });

		const showCalendar = calendars.find(
			(value) => value.displayName === showCalendarName,
		);

		if (!showCalendar) {
			console.error(`Calender with name '${showCalendarName}' not found.`);
			return;
		}

		// Fetch events
		const events = await client.getEvents(showCalendar.url, {
			// TODO: start from beginning of today
			start: new Date(),
		});

		const selectedEvents = events.slice(0, showEventsCount);
		console.log(JSON.stringify(selectedEvents, undefined, 2));
	} catch (error) {
		console.error("❌ Error getting CALDAV events:", error.message);
		process.exit(1);
	}
})();
