- 0: use the files in "./migrations" which are postgres database migration scripts to understand the application's database schema and create a mermaid schema diagram file documenting the database schema.
- 1: this result is incorrect. the database column's name should appear before the column's type.
- ISSUE: had to tell Claude the format, which it changes to "name type [key]". It shouldn't have been incorrect from the start to follow standard ER Diagramming best practices.

- write a function which converts a UTC date string and timezone string into the following strings:
  - date formatted as "MM/DD"
  - time formatted as "HH:MM AM/PM"
  - a relative string "in X days", if the date is less that 7 days away.
Make sure to respect the passed in timezone.
- ISSUE: resulting code has unneeded conversion funtion toDateString.
- ISSUE: duplicated type, making module syntacially incorrect.