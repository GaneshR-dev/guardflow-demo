# Glossary — words in the app

Use these words for all text that users see in the React app (`frontend/`). Each word has one meaning. Use the same word for the same thing on each screen.

The old app (`attendance-app.js`) does not change. Each screen gets these words when it moves to React.

## App words

| Word | Meaning | Do not use |
|---|---|---|
| Guard | A person whose attendance the app records. | employee, staff, worker |
| Site | A place where guards work, for example a client branch. | location, branch |
| Shift | A time window at a site, for example 9:00 am – 6:00 pm (IST). | duty (as a noun) |
| Check in (verb) | Record that a guard started work at a site. | clock in, sign in |
| Check-in (noun) | The record of a guard who started work. | — |
| Check out (verb) | Record that a guard finished work at a site. | clock out, sign out |
| Check-out (noun) | The record of a guard who finished work. | — |
| Checked in | Status: the guard is at work now. | on duty, present |
| Checked out | Status: the guard finished the shift today. | done, completed |
| Not checked in | Status: the guard has no check-in today. | absent, not in, missing |
| Supervisor | A user who records attendance at the sites assigned to them. | — |
| Admin | A user who manages one company: sites, guards and users. | manager |
| Owner | The user who manages the companies. | — |
| Company | One client account with its own sites, guards and users. | — |
| Sign in / Sign out | Start or end a session in the app. | log in, log out |
| Disabled | A guard, site or user that is paused. The data stays. | deleted, inactive |
| Report | Attendance for a day, a month or the history. | — |

## Screen titles and navigation

| Navigation label | Screen title |
|---|---|
| Home | Attendance overview |
| Attendance | Mark attendance |
| — | Guard check-in |
| — | Manage check-outs |
| Guards | Guards |
| Sites | Sites |
| Reports | Reports |
| Settings | Settings |
| — (owner only) | Your companies |

## Rules for app text

- Use sentence case for titles and buttons: "Mark attendance", not "Mark Attendance".
- Do not use short forms: "Attendance", not "Attend".
- Write numbers as digits. Use `plural()`: "1 guard", "2 guards".
- Write times as "9:00 am", with no leading zero. All times are IST.
- Write dates as "Tue 17 Nov" in lists and "Tuesday, 17 November 2026" in titles.
- Use only the three status words: Checked in, Checked out, Not checked in.
- In a message, tell what happened and what to do next. For example: "No access to this site. Ask an admin for access."

## Code and API names

Code, API fields and URL paths keep the old names. For example: `employee_id`, `/api/locations`, the route `/employees` and the component `LocationSheet`. Only the text that users see uses the words in this file.

## Check

`frontend/src/glossary.test.ts` searches the text of the React screens for the "Do not use" words. Add a word to this file and to the test at the same time.
