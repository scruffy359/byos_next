import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Returns the local timezone of the server. */
export function localTimezone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
