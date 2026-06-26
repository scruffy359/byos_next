"use server";
import { promises as fs } from "fs";
import { Event } from "ts-caldav";

export async function getDataFromFixture(fileName: string): Promise<Event[]> {
	const file = await fs.readFile(
		process.cwd() +
			`/app/(app)/recipes/screens/upcoming-calendar-events/${fileName}`,
		"utf8",
	);
	const json = JSON.parse(file);
	return json["events"] as Event[];
}
