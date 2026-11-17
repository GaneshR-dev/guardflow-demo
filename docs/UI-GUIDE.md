# UI guide — theme and components

Use this guide before you change a screen. Use the existing tokens, classes and functions. Add new ones only when no existing one fits.

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
| `confirmModal()` | `components/ConfirmDialog.tsx` (`pending` blocks a second submit, `error` shows the server message) |
| `locationSheet()` | `components/LocationSheet.tsx` |
| `header()`, `nav()` | `layout/Header.tsx`, `layout/BottomNav.tsx`. Use `<Page title="…">` from `layout/AppShell.tsx` for each screen. |
| `fmtDate()`, `fmtTime()`, `plural()`, `initials()`, `shortLoc()`, … | `lib/format.ts` (same names) |
| `go()`, hash history | React Router. Routes are in `routes.tsx`. |
| `seq` in `loadReport()` | TanStack Query keys. Put each filter in the key. |
| `esc()` | Not necessary. React escapes values. |
| `.primary`, `.secondary`, `.link` | shadcn `Button` (`default`, `outline`, `link`) |
| `.card` | `rounded-2xl border bg-card shadow-card` |

Routes: `/login`, `/owner`, `/home`, `/attendance`, `/attendance/add`, `/attendance/checkout`, `/employees`, `/locations`, `/locations/:id`, `/reports`, `/settings`. A screen that is not moved yet shows `NotMovedYet`, with a link to the old screen.

Data rules:
- Read data with `useQuery` and `api()`. Show `LoadingRows` while `isPending`, and `ScreenError` on `isError` with `onRetry={refetch}`.
- Change data with `useMutation`. Disable the submit button while `isPending`. Call `toast()` in `onSuccess`.
- The query cache is cleared when the session or the company changes.

Style rules:
- Radius: buttons and inputs `rounded-lg` (12 px), cards `rounded-2xl` (16 px), sheet top `rounded-t-3xl` (24 px).
- Touch targets: give buttons `h-11` (44 px) or more.
- Add a shadcn component with `npx shadcn@latest add <name>` in `frontend/`.
