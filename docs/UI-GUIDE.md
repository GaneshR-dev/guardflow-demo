# UI guide — theme and components

Use this guide before you change a screen. Use the words in [GLOSSARY.md](GLOSSARY.md) for all app text. Use the existing tokens, classes and functions. Add new ones only when no existing one fits.

## Visual reference

- Figma file: [Guardian – Reports redesign](https://www.figma.com/design/xLaLEctvsBdoOH5kyFx9gd). It has the Reports screens, the scenario screens (loading, empty, error, location sheet) and a component panel with colour variables.
- Design canvas: [Guardian Reports Redesign](https://claude.ai/artifact/YSLX7GP2XcWxd7pas8E6eU).
- Both links are private to the owner. Ask the owner for access.
- To let your AI tool read the Figma file:
  1. Get "Can view" access from the owner (Figma › Share).
  2. Connect Figma in your AI tool, with your own Figma account.

## Colour tokens

The tokens are in `:root` in `attendance-app.css`. Use `var(--name)`.

The React app (`frontend/`) has the same values in `frontend/src/index.css`. Use them as Tailwind classes, for example `bg-blue`, `text-navy`, `text-muted-foreground`, `border-line`, `bg-green-soft text-green-text`. The shadcn/ui variables use the same tokens: `primary` is `--blue`, `destructive` is `--red`, `border` is `--line`.

| Token | Value | Use |
|---|---|---|
| `--blue` | `#2367ea` | Primary action, links, active state, progress bar |
| `--navy` | `#10284c` | Brand word, active tab text |
| `--text` | `#172238` | Body text |
| `--muted` | `#68778d` | Secondary text, labels |
| `--line` | `#dfe7f2` | Borders |
| `--soft` | `#eef4fb` | Soft blue background (avatar, icon button) |
| `--green` / `--greenSoft` | `#17a36b` / `#dff7eb` | "On duty", "100%" |
| `--amber` / `--amberSoft` | `#a86200` / `#fff0d8` | "Not in", open items, not complete |
| `--red` | `#c73d4d` | Errors |
| `--card` | `#fff` | Card background |

Darker text colours for badges and selected states. Use them to keep text contrast at 4.5:1 on a soft tint:

| Colour | Use |
|---|---|
| `#0b6b42` | Text on `--greenSoft` |
| `#7d4900` | Text on `--amberSoft` |
| `#1c4fb8` | Text on the blue tint `#e5eefc` |
| `#b3263a` on `#fdecee` | Error icon |

## Type and spacing

- Font: Inter, then the system font.
- Page title: 27–28 px, bold. Section title: 16 px, bold. Body: 13–15 px. Small labels: 12 px. Do not use text smaller than 11 px.
- Corner radius: 12 px for buttons and inputs, 16 px for cards and lists, 24 px for the top of a bottom sheet.
- Page padding: 22 px (16 px on screens narrower than 380 px).
- Touch targets: 44 px or more.

## Shared components

### JavaScript template functions (`attendance-app.js`)

| Function | Use |
|---|---|
| `header()` | Top bar with the menu button and the brand word |
| `nav()` | Bottom navigation (Home, Attendance, Reports, Settings) |
| `message()` | Shows the error banner and the toast for the current screen |
| `toast(text)` | Shows a short confirmation at the bottom |
| `esc(value)` | Escapes a value for HTML. Use it for each dynamic value. |
| `fmtDate()`, `fmtMonth()`, `fmtTime()` | Date and time text (en-GB) |
| `initials(name)`, `plural(n, word)` | Avatar initials, "1 guard" / "2 guards" |
| `api(path, options)` | Calls the backend with the session token. Gives readable errors with `err.status`. Ends the session on 401. |
| `showScreenError(err, screen)` | Shows the shared error state for a screen that could not load (403, 404, no network, server error) |
| `friendlyError(status, message)` | Gives a plain message for server errors (5xx) instead of internal text |
| `endSession()` | Clears a refused session and shows the sign-in screen. `api()` calls it on 401. |

### CSS classes (`attendance-app.css`)

| Class | Use |
|---|---|
| `.page` | Screen container. Add `.noNav` when there is no bottom navigation. |
| `.card` | White card with border and shadow |
| `.primary` | Main action button (blue, full width) |
| `.secondary` | Second action button (white, blue text) |
| `.link` | Text button that looks like a link |
| `.badge` + `.green` / `.amber` / `.blue` | Status label |
| `.chip` | Small filter button |
| `.person` | Row with initials, name and a value on the right |
| `.navLink` | Full-width row that opens a sub-screen |
| `.field`, `.search` | Form field and search input |
| `.error`, `.toast` | Error banner and toast. Do not use `.error` as a modifier on other components. |

## Reports components (`rp` prefix)

The Reports screen has the newest components. Use them again in new screens.

| Component | Class or function | Use |
|---|---|---|
| Tabs | `.rpTabs`, `.rpTab` | Switch between views of one screen |
| Select button | `.rpSelect` | Button that opens a picker (date, location) |
| Filter figures | `.rpStats`, `.rpStat` | Numbers that filter a list when the user taps them |
| List | `.rpList`, `.rpRow`, `.rpAvatar`, `.rpWho`, `.rpWhen` | List of people or items with dividers |
| List header | `.rpListHead` | Count on the left, one action or note on the right |
| Progress | `progress(done, total)`, `.rpBar` | Percentage and progress bar |
| Summary | `monthSummary(totals)`, `.rpSummary` | One line, one bar, one sub-line |
| Card with figures | `.rpLoc`, `.rpFigures` | Tappable card with three figures |
| Empty and error state | `emptyState(icon, title, text, cta, tone)`, `reportError(r)` | Use tone `rpError` for errors |
| Loading | `skeletonRows(n)`, `.rpSkel` | Grey placeholder rows |
| Bottom sheet | `.rpScrim`, `.rpSheet`, `.rpOption` | Pick one item from a short list |
| Icons | `ICON.*`, `svgIcon(path)` | Inline stroke icons. Do not use emoji as icons. |

## States and feedback

Use these components for each state. The full rules are in `AGENTS.md` ("Errors, loading and feedback").

| State | Component | Example text |
|---|---|---|
| Loading | `skeletonRows(n)`, `.rpSkel`, status line `.rpHint` | "Loading the HSR Layout report…" |
| Empty | `emptyState(icon, title, text, cta)` | "No attendance for this day yet" + "Go to today" |
| No network / server error | `reportError(r)` (tone `rpError`) + "Try again" | "Could not load the report" |
| No access (403) | `emptyState()` without a retry button | "You have no access to this location" |
| Not found (404) | `emptyState()` with a way back | "This location no longer exists" + "Back to locations" |
| Form error (400, 409, 422) | Text next to the form, or `state.error` + `message()` | The server message |
| Success of an action | `toast(text)` | "Checked in · Ananya Rao" |

The Figma file has the loading, empty and error screens for Reports (row "Scenarios — Day").

## Screen checklist

Before you finish a screen change, make sure that:
- The screen works at 390 px wide, with no horizontal scroll.
- The loading, empty and error states exist.
- No network, 401, 403, 404 and server errors each show the correct state.
- Each finished action shows a toast. Page loads do not.
- All dynamic values go through `esc()`.
- The colours come from the tables above.
- Each touch target is 44 px or more.

## React app (`frontend/`)

The screens move to React one at a time. Use this table to find the React form of an old helper.

| Old (`attendance-app.js`) | React (`frontend/src/`) |
|---|---|
| `api()`, `httpError()` | `lib/api.ts`: `api<T>(path, options)`. It throws `ApiError` with `status` and `network`. A 401 ends the session. |
| `friendlyError()` | `lib/api.ts`: `friendlyError(status, message)` |
| session state, `endSession()`, `uiRole()` | `auth/session.ts`: `useSession()`, `startSession()`, `selectCompany()`, `endSession()`, `uiRole()`. Same localStorage keys as the old app. |
| `logout()` | `auth/signOut.ts`: `signOut()` |
| `showScreenError()`, `screenErrorView()`, `reportError()` | `components/ScreenError.tsx`: `<ScreenError error={…} atLocation onRetry onChooseLocation onReset loadedAt />` |
| `emptyState()` | `components/EmptyState.tsx` (`tone="error"` for errors) |
| `skeletonRows()`, `.rpSkel` | `components/LoadingRows.tsx`: `<LoadingRows label="Loading the report…" />` |
| `message()` error banner | `components/ErrorBanner.tsx` |
| `toast()` | `lib/toast.ts`: `toast(text)` |
| file download (`exportAudit()`) | `lib/api.ts`: `apiFile(path, filename)`, with the same errors as `api()` |
| `.dashStat` tiles | `components/StatTile.tsx`: a number with a label. With `onClick` it is a filter button with `aria-pressed`. Status colours from `lib/tone.ts`. |
| search box over a long list | `components/StickySearchBar.tsx`: the search box stays at the top while the list scrolls. `lib/useScrolledPast.ts` tells when the tiles above are out of view, so the bar can show a compact copy of the filters. |
| `confirmModal()` | `components/ConfirmDialog.tsx` (`pending` blocks a second submit, `error` shows the server message) |
| `locationSheet()` | `components/LocationSheet.tsx` |
| `header()`, `nav()` | `layout/Header.tsx`, `layout/BottomNav.tsx`. Use `<Page title="…">` from `layout/AppShell.tsx` for each screen. |
| `fmtDate()`, `fmtTime()`, `plural()`, `initials()`, `shortLoc()`, … | `lib/format.ts` (same names) |
| `go()`, hash history | React Router. Routes are in `routes.tsx`. |
| `seq` in `loadReport()` | TanStack Query keys. Put each filter in the key. |
| `esc()` | Not necessary. React escapes values. |
| `.primary`, `.secondary`, `.link` | shadcn `Button` (`default`, `outline`, `link`) |
| `.card` | `rounded-2xl border bg-card shadow-card` |

Routes: `/login`, `/owner`, `/home`, `/attendance`, `/attendance/add`, `/attendance/checkout`, `/employees` (Guards), `/locations` (Sites), `/locations/:id` (one site), `/reports`, `/settings`. Only the owner console (`/owner`) is not moved yet. It shows `NotMovedYet`, with a link to the old screen.

### Hover and press states

Each button, clickable item and input has a hover state. The styles are in `frontend/src/index.css`.

| Item | Use | Hover |
|---|---|---|
| White clickable box: card, tile, list row, select button (site, date), sheet row | `tap-card` | Background `--soft`, border 40 % blue |
| Icon-only or text-only button with no box: back, password eye, bottom menu tab | `tap-icon` | Background `--soft`, text `--blue-text` |
| Tab in a segmented control (the button holds a pill) | `tap-tab` | Pill white at 60 %, text `--text` |
| shadcn `Button` | the variant | `default`: darker blue (`--blue-text`). `outline`: white, `--soft` on hover. `ghost`: `--soft`. `link`: underline. |
| shadcn `Input`, `Textarea` (also `PasswordInput`) | built in | Border 40 % blue only. No hover while the field has focus (focus has its blue ring). |

Rules:
- Hover shows only on a device with a mouse (`@media (hover: hover)`). A tap on a phone does not leave a hover look.
- A disabled item and a selected item (`aria-pressed`, `aria-checked`, `aria-current="page"`, a checked input) keep their look on hover.
- An icon inside a card or a button (map pin, chevron, status dot) does not get its own hover. The item around it shows the hover.
- Clickable items show the pointer cursor.
- All hover colours keep text contrast at 4.5:1 or more.
- `frontend/src/hover.test.ts` reads the screens. Each `<button>`, `<Link>`, `<a>`, `<label>` with an input and raw `<input>` with a `className` must have `hover:` or a `tap-` utility. A new button with no hover fails the test.

### Sign-in screen (`screens/Login.tsx`)

- Fields: 54 px high, `bg-field` (`#edf3f9`), 1 px `border-line`, 12 px radius, 2 px blue focus ring. Browser autofill keeps the same fill (`index.css`).
- User ID: no autocorrect, no capitals, no spell check.
- Password: a show/hide button (44 × 44 px) with `aria-label` and `aria-pressed`.
- Sign in: "Signing in…" with a spinner while the request runs. The form is disabled. A second tap sends nothing.
- Wrong password: keep the User ID, clear the password and focus it. Other errors keep both values.
- "Forgot password?" opens a help sheet, not a toast.
- The demo box shows only when `/api/health` returns `demo_mode: true`. A demo button fills the form. It does not sign in.
- The footer is in the page flow, so it never covers the form.
- Background `bg-login-bg` (`#f5f9ff`).

### Page sections (`layout/AppShell.tsx` `Page`)

Each page has the same sections. Each section has a fixed height, so it starts at the same position on every page (390 px: title text at 67 px, context row at 114 px, content at 174 px).

| # | Section | Height | `Page` prop |
|---|---|---|---|
| 1 | Brand bar ("Guardian") | 20 px, then 20 px space | — |
| 2 | Title row: title, and an optional icon action on the right | always 44 px, then 8 px space | `title`, `action` |
| 3 | Context row, for example the site button and the date | 44 px or more, then 16 px space | `context` |
| 4 | Content | — | `children` |

- Put the context row in the `context` prop. Do not add a top margin (for example `-mt-2`) to the first block of a screen.
- A page with no context row starts its content 8 px under the title row.
- The sign-in screen has its own layout.

### Home screen (`screens/Home.tsx`)

Home answers one question: "Are my sites covered today?"

- Four big tiles in a 2 × 2 grid: Guards (normal text), Checked in (green), Checked out (grey), Not checked in (amber). The status colours are in [GLOSSARY.md](GLOSSARY.md). Numbers 26 px, labels 13 px. Each number shows one time only.
- No location picker. The location list is the only location control. A tap on a card opens Attendance for that location (`/attendance?location=<id>`).
- Groups (`lib/coverage.ts`): "Needs attention" (the shift started and guards are not checked in, biggest gap first), "Upcoming" (the shift has not started: "Shift starts 2:00 pm"), "All checked in", and disabled sites folded at the end.
- One site only: no list, one "Mark attendance" button.
- "Updated <time>" and a Refresh button. A failed refresh keeps the data and shows a banner.

### Attendance screen (`screens/Attendance.tsx`)

One screen replaces the 3 old screens (list, check-in, check-outs). Each row has its own action.

- Site: a button that opens `LocationSheet` (active sites only). The site, the filter and the search are in the URL (`?location=`, `?status=`, `?q=`).
- Filters: 4 `StatTile` buttons in a 2 × 2 grid, the same tiles as on Home (All, Not checked in, Checked in, Checked out). The counts show only here.
- Sticky bar: the search box stays at the top while the list scrolls. When the tiles scroll out of view, a compact copy of the 4 filters shows in the bar (4 equal columns, number above a small label).
- Cards: each guard is a card with a 10 px gap between cards. Top: initials, name (wraps, never cut), guard ID, and the edit button (admin) at the top right. Bottom: the status with a coloured dot, and one action.
- Actions: all the same size (112 × 44 px). "Check in" (always filled, also on a checked-out card for one more shift) and "Check out" (outline). Each button label names the guard ("Check in Anil Sharma").
- "Add a guard" (admin): an icon at the top right of the page (`Page` `action` prop). When a search finds nobody, one line ("Can't find a guard?") and an "Add a guard" link show. No box.
- "Open from earlier days": check-ins that were not closed, with "Check out".
- Search: filters this site and also finds guards at other sites ("ad hoc"). Disabled guards show a note and no button.
- Dialogs: "Confirm check-in", "Second shift today", "Confirm check-out" (with hours worked). Admin sheets: "Edit times" and "Add a guard" (`GuardSheet` with a fixed site).
- `/attendance/add` and `/attendance/checkout` open the matching filter.
- Data: the app loads each site one time (`['attendance', siteId]`). The filters and the search work on the phone (`screens/attendance/filters.ts`, the same search rule as the server), with no new request. The data is fresh for 30 seconds. After that, the app loads it again when the user comes back to it. Each action (check-in, check-out, edit, add) loads it again. Only the search for guards at other sites calls the server.
- `ConfirmDialog` blocks a fast double tap. A new question in the same dialog ignores taps for 400 ms.

### Bottom menu and Settings (`layout/BottomNav.tsx`, `screens/settings/`)

- The bottom menu has 4 tabs: Home, Attendance, Reports, Settings. The Settings tab is also active on `/employees` and `/locations`.
- Settings home: "Manage" (Guards and Sites, with counts) first, then "Account" (My profile, User access, Activity log for admins), then "Sign out". Each entry is a `SettingsRow` (64 px link).
- Sub-screens use `Page` `back` (a 44 px back button at the left of the title).
- My profile: Save is disabled until the name changes. The new name updates the session.
- User access: user cards. Admins open a supervisor: sites (`SiteChecklist`), a new password (sheet), disable or enable (confirm dialog). "Add a supervisor" is an icon at the top right.
- Activity log: titles in the glossary words, IST dates. The export icon downloads the CSV with `apiFile()`.
- Forms use `useSingleSubmit()` (`lib/useSingleSubmit.ts`): a fast double tap sends one request.

### Guards screen (`screens/Guards.tsx`, `screens/guards/`)

There is no Figma frame for this screen. It uses the patterns of User access, Attendance and Reports.

- Opens from Settings at `/employees`. `Page` `back` goes to Settings.
- Title row (admin): an import icon (a `label` with a hidden CSV file input) and "Add a guard".
- A site button (`LocationSheet` with "All sites"; admins also get "No site yet", value `none`). The site is in the URL (`?site=`). An unknown site shows all sites.
- `StickySearchBar` under the site button: name or guard ID, the same rule as Attendance.
- Cards: initials, name, `ID · site`. When the list shows one site, the cards do not repeat the site name. An admin taps an active card to edit the guard (`tap-card`, chevron). A supervisor only reads.
- Disabled guards (the guard or the site is disabled) are in a folded section at the end, as the disabled sites on Home. A search opens it. "Enable" is one tap. A guard at a disabled site shows "Enable the site first." and no button.
- `GuardSheet` (`components/GuardSheet.tsx`): add or edit a guard (name, phone, site). On Attendance the site is fixed and there is no site field. On Guards the site in the filter is the default site. Save is disabled until a value changes. "Disable guard" opens a `ConfirmDialog`.
- Import: columns `id,name,phone,role,location_id`. An empty `location_id` gets the site in the filter. `lib/csv.ts` reads the file. Possible duplicates show in an amber note.
- Data: `['employees']` (Settings already loads it) and `['locations']`. The filter and the search work on the phone. Each change loads the guards, sites, Home and Attendance again.
- Server rules: `PATCH /api/employees/{id}` blocks a disabled guard, a disabled site and a move during an open check-in (409). A move writes `employee.transfer`; a name or phone change writes `employee.update`.

### Sites screens (`screens/Sites.tsx`, `screens/sites/`)

Figma was not read for these screens (the Figma MCP plan limit). They use the patterns of Guards, User access and Reports.

- `/locations`: the sites, with `StickySearchBar` (name or area). Each card: short name, `city · area`, guard count and shifts. A tap opens the site (both roles). Disabled sites are in a folded section; a search opens it.
- Title row (admin): an import icon (CSV `id,name,area,assigned_count`) and "Add a site". `/locations?add=1` opens the add sheet at once. "Add a site" on Home and Attendance links there.
- `/locations/:id`: title = short name, context row = `city · area` (+ "Disabled"). Then the Shifts card (each shift, "Ends the next day" for an overnight shift), a Guards row (`SettingsRow`, opens `/employees?site=id`), "Mark attendance here" (primary) and, for an admin, "Disable site" at the end. A disabled site shows "Enable site" instead.
- `SiteSheet`: add a site (name, area, shifts, one supervisor or "Leave unassigned") or edit the name and area (pencil icon at the top right). The server makes the site ID. After an add, the new site opens.
- `ShiftSheet` and `ShiftFields`: up to 5 shifts, start and end time (IST). `shiftRowsProblem()` in `lib/shift.ts` has the server rules (both times, start and end differ, no shift two times). The problem shows under the shift and Save is disabled.
- Supervisors change in User access, as before. A supervisor only reads the Sites screens.
- Data: the site comes from `['locations']`, so the site screen does not load it again. Each change loads the sites, settings, Home, Attendance and guards again.

### Reports screen (`screens/Reports.tsx`, `screens/reports/`)

- Title row: "Reports" and an "Excel" button (not on History). `ExcelButton` has the same corners and white background as the date and site buttons. It is 40 px high (the collaborator chose this height; the other buttons are 44 px).
- Context row: the Day · Month · History tabs. A grey track (`bg-line`); the selected tab is a white pill with bold text. Each button is 44 px high; the pill inside it is smaller.
- Filters: a date or month button (`PeriodButton`: the native picker input covers the whole button) and a site button (`LocationSheet`; Month has "All sites").
- The tab, date, month, site and Day status filter are in the URL. A site detail is `/reports/sites/:id?month=`.
- Day: 4 `StatTile` filters (All entries, Checked in, Checked out, Not checked in), "N guards · N entries", "Avg shift", read-only guard cards. The status filter works on the phone.
- Day search: the same sticky bar as on Attendance (`StickySearchBar` and `CompactFilters`). It finds a name or a guard ID on the phone, with no new request. A new date or site clears the search. No match: "No guards match …" with "Clear search".
- Month: `SummaryCard` ("X of Y completed", %, bar, "N open · avg shift"), then one card for each site. A site card opens the site detail ("By day"); a day opens the Day tab.
- History: the last 6 months, each with a 44 px Excel download icon. Each month shows "completed / all entries", for example "612 / 640": green when all entries are completed, amber when some are open (attention needed), "No records" when empty. Screen readers hear "612 of 640 entries completed".
- Excel: `apiFile()`, disabled until the data has records. Toast "Excel file is ready · <file>". A failure shows the error banner.

### Edit times sheet (`screens/attendance/EditTimesSheet.tsx`)

The sheet uses the site shift (`lib/shift.ts`; the server has the same rule in `shift_window()`).

- The shift of a check-in is the shift whose start is nearest to the check-in (on the day before, the day, or the day after). This covers an early check-in and an overnight shift.
- When the admin changes the check-in time, the check-out time is set to the shift end. A check-out time that the admin typed stays.
- "Use shift end" fills the check-out time. "Still at work" clears it. One tap each.
- There is no check-out date field. A check-out that is not later than the check-in is on the next day: "Check-out: Wed 18 Nov (next day)".
- A check-out after the shift end, or a check-in after the shift end, shows an error under the field and disables "Save times". The server refuses it too (400).
- A site with no shift has no limit.
- The reason is a 3-line text area with a 200-character counter.

### General rule: fewer taps

Fill each value that the app can work out. Ask the user only for what the app cannot know.

### Panel and text colour

- Each screen is a 430 px panel on `bg-app` (`#f7faff`), the same as the old `.app`.
- `text-muted-foreground` is `#56657b` (5.6:1 on `bg-app`). The old `--muted-text` (`#68778d`) is below 4.5:1 on light backgrounds. Use it only on white.

Data rules:
- Do not ask the server again for data that the screen already has. Filter and search it on the phone when the data is small (one site).
- Read data with `useQuery` and `api()`. Show `LoadingRows` while `isPending`, and `ScreenError` on `isError` with `onRetry={refetch}`.
- Change data with `useMutation`. Disable the submit button while `isPending`. Call `toast()` in `onSuccess`.
- The query cache is cleared when the session or the company changes.

Style rules:
- Radius: buttons and inputs `rounded-lg` (12 px), cards `rounded-2xl` (16 px), sheet top `rounded-t-3xl` (24 px).
- Touch targets: give buttons `h-11` (44 px) or more.
- Add a shadcn component with `npx shadcn@latest add <name>` in `frontend/`.
