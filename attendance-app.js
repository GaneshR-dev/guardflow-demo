// Guardian attendance demo - single-page frontend.
// Renders every screen (login, attendance, employees, reports, settings) into #app
// from the `state` object below, and talks to the FastAPI backend over /api/*.
// Plain script (no framework, no build step); served by the backend at /attendance-app.js.

// Small formatting and escaping helpers used by the templates.
const $app = document.getElementById('app');
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const dayISO = (d) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const API = '';
// All attendance times are shown and entered in Indian Standard Time, whatever the device clock says.
const IST_TZ = 'Asia/Kolkata';
const istNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ }));
const todayISO = () => dayISO(istNow());
const fmtDate = (d) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
const fmtMonth = (d) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d);
const fmtTime = (v) =>
  v
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST_TZ }).format(
        new Date(v),
      )
    : '-';
const nowTime = () => fmtTime(new Date().toISOString());
// Stored UTC ISO -> "HH:MM" IST wall clock for <input type="time"> fields.
const toHHMM = (v) =>
  v
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST_TZ }).format(
        new Date(v),
      )
    : '';
// Shift times are stored as plain IST "HH:MM" text on the location.
const fmtShift = (v) => {
  if (!v) return '';
  const [h, m] = v.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
};
// Shift windows of a branch: the new list, falling back to the legacy single pair.
const locationShifts = (l) =>
  l.shifts && l.shifts.length
    ? l.shifts
    : l.shift_start && l.shift_end
      ? [{ shift_start: l.shift_start, shift_end: l.shift_end }]
      : [];
const shiftLabel = (l) => {
  const shifts = locationShifts(l);
  if (!shifts.length) return 'No shift set';
  if (shifts.length === 1) return fmtShift(shifts[0].shift_start) + ' - ' + fmtShift(shifts[0].shift_end) + ' IST';
  return shifts.length + ' shifts';
};
const initials = (n) =>
  n
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
const plural = (n, one, many = one + 's') => (n === 1 ? `${n} ${one}` : `${n} ${many}`);
// Headcount label that never contradicts the greyed rows: a branch with only disabled
// guards reads "0 active employees · 3 disabled", not "0 employees".
const empCountLabel = (l, one = 'employee', many = one + 's') =>
  Number(l.disabled_count)
    ? `${plural(l.assigned_count, 'active ' + one, 'active ' + many)} · ${plural(l.disabled_count, 'disabled', 'disabled')}`
    : plural(l.assigned_count, one, many);
// Helpers that build stable, URL-safe location IDs from free-text branch names.
function slugId(value, prefix = 'loc') {
  let s = (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) s = 'new';
  if (!s.startsWith(prefix + '-')) s = prefix + '-' + s;
  return s.slice(0, 40).replace(/-+$/, '') || prefix + '-new';
}
function uniqueId(base, taken) {
  let id = base,
    i = 2;
  while (taken.includes(id)) {
    const suffix = '-' + i;
    id = base.slice(0, 40 - suffix.length) + suffix;
    i++;
  }
  return id;
}
function newLocationId(name) {
  return uniqueId(
    slugId(name, 'loc'),
    state.locations.map((l) => l.id),
  );
}
// The one mutable client-side store. Every screen renders from this object;
// token/user persist in localStorage so a reload restores the session.
// Everything that belongs to one signed-in account. Rebuilt from scratch whenever the
// session changes so no screen can show a previous login's data.
function freshSessionState() {
  return {
    screen: 'login',
    locations: [],
    location: null,
    attendance: [],
    summary: {},
    employees: [],
    dashboard: null,
    report: null,
    settings: null,
    settingsView: '',
    accessUserId: '',
    overviewLocation: '',
    showLocationForm: false,
    query: '',
    locationQuery: '',
    addQuery: '',
    outQuery: '',
    lookupResults: null,
    employeeQuery: '',
    employeeLocation: '',
    showEmployeeForm: false,
    filter: 'all',
    notice: '',
    error: '',
    confirm: null,
    detail: null,
    editTimes: null,
    shiftDraft: null,
    shiftSaving: false,
    shiftError: '',
    checkingIn: false,
  };
}
// The owner has no company of their own. After picking a company the screens behave as that
// company's admin (the server enforces it from the X-Company-Id header); before that, only the console.
const uiRole = () => (state.user?.role === 'owner' ? (state.companyId ? 'admin' : 'owner') : state.user?.role);
const state = {
  token: localStorage.getItem('gf_token') || '',
  user: JSON.parse(localStorage.getItem('gf_user') || 'null'),
  companyId: localStorage.getItem('gf_company') || '',
  ...freshSessionState(),
};
// Drop all per-account data (keeps nothing but the login screen state).
function clearSessionState() {
  for (const k of Object.keys(state)) if (k !== 'token' && k !== 'user') delete state[k];
  Object.assign(state, freshSessionState());
}
// Shared yes/no overlay. `onOk` runs when the user confirms; Cancel just closes.
function confirmModal() {
  const c = state.confirm;
  if (!c) return '';
  return `<div class="modalOverlay"><div class="modalCard" role="dialog" aria-modal="true"><h2>${esc(c.title)}</h2>${(c.lines || []).map((l) => `<div class="confirmLine"><span>${esc(l.label)}</span><strong>${esc(l.value)}</strong></div>`).join('')}<div class="modalActions"><button class="secondary" id="confirmCancel">Cancel</button><button class="primary ${c.danger ? 'dangerBtn' : ''}" id="confirmOk">${esc(c.okLabel || 'Confirm')}</button></div></div></div>`;
}
// Transient confirmation banner shown at the bottom of the screen.
function toast(msg) {
  const id = Date.now();
  state.toastId = id;
  state.notice = msg;
  render();
  setTimeout(() => {
    if (state.toastId === id) {
      state.notice = '';
      render();
    }
  }, 2400);
}
// Thin fetch wrapper: adds the bearer token, parses JSON, and maps failures to
// user-readable errors. Network outages get their own message; the login 401 keeps
// its exact wording; everything else surfaces the server's detail text.
async function api(path, opts = {}) {
  let res;
  const sentToken = state.token;
  // A reply that lands after the session changed (sign-out, another login) belongs to the
  // old account: it is dropped so it can never write into the new session's screens.
  const stale = () => path !== '/api/login' && state.token !== sentToken;
  try {
    res = await fetch(API + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(sentToken ? { Authorization: 'Bearer ' + sentToken } : {}),
        ...(sentToken && state.companyId && !path.startsWith('/api/owner/') ? { 'X-Company-Id': state.companyId } : {}),
      },
    });
  } catch (netErr) {
    if (stale() && path !== '/api/logout') return new Promise(() => {});
    const err = new Error('Cannot reach the Guardian server. Check the connection and try again.');
    err.network = true;
    throw err;
  }
  const text = await res.text();
  if (stale() && path !== '/api/logout') return new Promise(() => {});
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    if (path === '/api/login' && res.status === 401) throw httpError(401, 'Wrong password or user ID. Try again.');
    // Any other 401 means the server no longer accepts this session (expired, revoked
    // or signed out on another device). /api/logout handles its own 401.
    if (res.status === 401 && path !== '/api/logout') {
      endSession();
      throw httpError(401, SESSION_ENDED);
    }
    const detail = Array.isArray(data.detail)
      ? data.detail.map((x) => x.msg || x.message || String(x)).join('; ')
      : data.detail;
    throw httpError(res.status, detail || 'Request failed');
  }
  return data;
}
// Errors from api() carry the HTTP status, so screens can show the right state
// (403 no access, 404 not found, 409/422 input problems, 5xx server errors).
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
const SESSION_ENDED = 'Your session ended. Sign in again.';
// Clear a session the server refused and show the sign-in screen with a clear message.
function endSession() {
  ++attendanceGeneration;
  localStorage.removeItem('gf_token');
  localStorage.removeItem('gf_user');
  localStorage.removeItem('gf_company');
  state.token = '';
  state.user = null;
  clearSessionState();
  state.companyId = '';
  state.error = SESSION_ENDED;
  state.screen = 'login';
  history.replaceState({ gfScreen: 'login' }, '', '#login');
  render();
}
// Screen templates: each returns an HTML string for one screen. Nothing here
// touches the network; data comes from `state`.
// One stroke icon family keeps navigation and action symbols optically consistent.
function uiIcon(name) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    attendance: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16m-11 5 2 2 4-4"/>',
    employees:
      '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m4 10v-2a6 6 0 0 0-4-5"/>',
    locations: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    reports:
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 17v-3m4 3v-5m4 5v-2"/>',
    settings:
      '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3h3l2 3h3l1-3 3-1 2-3-2-2 1-3-2-3h-3l-2-3Z"/><circle cx="12" cy="12" r="3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.home}</svg>`;
}
function nav() {
  const items = [
    ['home', 'home', 'Home', 'Home'],
    ['attendance', 'attendance', 'Attend', 'Attendance'],
    ['employees', 'employees', 'Emp', 'Employees'],
    ['locations', 'locations', 'Loc', 'Locations'],
    ['reports', 'reports', 'Reports', 'Reports'],
    ['settings', 'settings', 'Settings', 'Settings'],
  ];
  return `<div class="bottomNav">${items
    .map(
      ([key, icon, label, full]) =>
        `<button class="navItem ${
          (key === 'home' && ['home', 'dashboard'].includes(state.screen)) ||
          state.screen === key ||
          (key === 'attendance' && ['add', 'checkout'].includes(state.screen)) ||
          (key === 'locations' && state.screen === 'locationDetail')
            ? 'active'
            : ''
        }" data-nav="${key}" aria-label="${full}"><b aria-hidden="true">${uiIcon(icon)}</b>${label}</button>`,
    )
    .join('')}</div>`;
}
function header() {
  const owner =
    state.user?.role === 'owner'
      ? `<span class="ownerBar">${state.companyId ? 'Managing: <b>' + esc(state.companyName || 'selected company') + '</b>' : 'Owner'} <button class="link" id="ownerSwitch">${state.companyId ? 'Switch company' : ''}</button></span>`
      : '';
  return `<div class="top"><span class="brand">Guardian</span>${owner}</div>`;
}

function message() {
  return `${state.error && state.screen !== 'login' ? `<div class="error">${esc(state.error)}</div>` : ''}${state.notice ? `<div class="toast">${esc(state.notice)}</div>` : ''}`;
}
// Shared error state for a screen that could not load its data. Form and action
// errors (400, 409, 422) stay in the error banner from message(); a 401 ends the session.
const SCREEN_TITLES = {
  attendance: 'Mark attendance',
  add: 'Employee check-in',
  checkout: 'Manage check-outs',
  dashboard: 'Attendance overview',
  home: 'Attendance overview',
  employees: 'Employees',
  locations: 'Locations',
  settings: 'Settings',
  menu: 'Menu',
};
const LOCATION_SCREENS = ['attendance', 'add', 'checkout'];
// Server errors (5xx) can carry internal text; show a plain message instead.
const friendlyError = (status, message) =>
  status >= 500 ? 'The server had a problem. Try again in a moment.' : message;
function showScreenError(e, screen = state.screen) {
  if (e?.status === 401 || !state.token) return;
  state.screenError = { screen, status: e?.status || 0, message: e?.message || 'Request failed' };
  state.screen = screen;
  render();
}
function screenErrorView() {
  const e = state.screenError;
  const atLocation = LOCATION_SCREENS.includes(e.screen);
  const choose = '<button class="secondary rpCta" data-screen-locations>Choose location</button>';
  const home = '<button class="secondary rpCta" data-go="home">Go to Home</button>';
  let body;
  if (e.status === 403)
    body = atLocation
      ? emptyState(
          ICON.emptyPin,
          'No access to this location',
          'Ask an admin for access, or choose another location.',
          choose,
        )
      : emptyState(ICON.emptyPin, 'No access', 'Your account cannot open this page. Ask an admin for access.', home);
  else if (e.status === 404)
    body = atLocation
      ? emptyState(
          ICON.emptyPin,
          'Location not found',
          'This location no longer exists. Choose another location.',
          choose,
        )
      : emptyState(ICON.emptyPin, 'Not found', 'This item no longer exists.', home);
  else
    body = emptyState(
      ICON.wifiOff,
      'Could not load this page',
      friendlyError(e.status, e.message),
      `<button class="primary rpCta" data-screen-retry>${ICON.retry}Try again</button>`,
      'rpError',
    );
  return `<div class="page rp">${header()}<h1>${esc(SCREEN_TITLES[e.screen] || 'Guardian')}</h1>${body}</div>${nav()}`;
}
function login() {
  return `<div class="page noNav login"><div class="logo">G</div><h1>Guardian</h1><p class="sub">Sign in to manage today's attendance</p>${state.error ? `<div class="error" role="alert" style="margin-bottom:16px">${esc(state.error)}</div>` : ''}<form id="loginForm"><div class="field"><label>User ID</label><input name="username" placeholder="Enter your user ID" autocomplete="username" required></div><div class="field"><label>Password</label><input name="password" type="password" placeholder="Enter your password" autocomplete="current-password" required></div><div class="forgot"><button type="button" class="link" id="forgot">Forgot password?</button></div><button class="primary">Sign in</button></form><div class="demoBox"><b>DEMO ACCESS</b>Admin: admin.demo / demo123<br>Supervisor: supervisor.demo / demo123</div><div class="footerNote">© 2026 Guardian</div></div>${message()}`;
}
function locationSupervisorField() {
  const access = state.settings?.access;
  const supervisors = Array.isArray(access) ? access.filter((u) => u.role === 'supervisor') : [];
  return `<div class="field"><label for="locationSupervisor">Assign to supervisor</label><select id="locationSupervisor" name="supervisor_id" required ${!Array.isArray(access) ? 'disabled' : ''}><option value="" disabled selected>Choose a supervisor or leave unassigned</option>${supervisors.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join('')}<option value="__unassigned__">Leave unassigned</option></select><small id="locationSupervisorSelection" class="helper" style="display:block;margin-top:6px">No supervisor selected.</small><small class="helper" style="display:block;margin-top:4px">${!Array.isArray(access) ? 'Supervisor list unavailable. Reopen this form to retry.' : supervisors.length ? 'Only the selected supervisor gets access. Existing assignments stay unchanged.' : 'No supervisor accounts yet. Leave unassigned, then create a supervisor in Settings > User access.'}</small></div>`;
}
// Shift timing slots inside the location forms, matching the user-picked reference:
// inline repeatable cards titled Slot 1..N, a "N / 5 slots" counter, and an
// "+ Add another slot" button with a hard limit of 5. Each slot is editable right
// after adding; no accordions, no label field - just the two times.
const MAX_SHIFT_SLOTS = 5;
function shiftRowHtml(row = {}, position = 1) {
  // The label survives as a hidden field: not editable in this UI, but never erased -
  // a save round-trips the exact label the API returned (imported/older rows can have one).
  // Remove is a small red trash button; the accessible name keeps the slot number.
  return `<div class="shiftRow" data-shift-row><input type="hidden" name="shift_label" value="${esc(row.label || '')}"><div class="shiftSlotHead"><strong>Slot ${position}</strong><button type="button" class="shiftRemove" aria-label="Remove slot ${position}" title="Remove slot" onclick="removeShiftRow(this)"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg></button></div><div class="shiftTimes"><div><small class="helper">Start time (IST)</small><input name="shift_start" type="time" value="${esc(row.shift_start || '')}"></div><div><small class="helper">End time (IST)</small><input name="shift_end" type="time" value="${esc(row.shift_end || '')}"></div></div></div>`;
}
function shiftFields(rows = [], showHeading = true) {
  return `<div class="field">${showHeading ? `<div class="shiftFieldHead"><label>Shift timings</label><span class="muted small" id="shiftCount">${rows.length}/${MAX_SHIFT_SLOTS}</span></div>` : ''}<div id="shiftRows">${rows.map((r, i) => shiftRowHtml(r, i + 1)).join('')}</div><button type="button" class="link shiftAdd" id="addShiftRow">+ Add slot</button></div>`;
}
function renumberShiftRows(scope = document) {
  const rows = [...scope.querySelectorAll('[data-shift-row]')];
  rows.forEach((r, i) => {
    const title = r.querySelector('.shiftSlotHead strong');
    if (title) title.textContent = `Slot ${i + 1}`;
    const removeBtn = r.querySelector('.shiftRemove');
    if (removeBtn) removeBtn.setAttribute('aria-label', `Remove slot ${i + 1}`);
  });
  const counter = scope.querySelector('#shiftCount');
  if (counter) counter.textContent = `${rows.length}/${MAX_SHIFT_SLOTS}`;
  const add = scope.querySelector('#addShiftRow');
  if (add) add.style.display = rows.length >= MAX_SHIFT_SLOTS ? 'none' : '';
}
function removeShiftRow(btn) {
  const scope = btn.closest('form') || document;
  btn.closest('[data-shift-row]').remove();
  renumberShiftRows(scope);
  captureShiftDraft(scope);
}
// Read a form's shift rows. Each used row needs both times; empty rows are ignored.
function collectShiftRows(scope) {
  const shifts = [...scope.querySelectorAll('[data-shift-row]')]
    .map((row) => ({
      label: row.querySelector('[name=shift_label]')?.value.trim() || null,
      shift_start: row.querySelector('[name=shift_start]').value,
      shift_end: row.querySelector('[name=shift_end]').value,
    }))
    .filter((s) => s.label || s.shift_start || s.shift_end);
  if (shifts.some((s) => !s.shift_start || !s.shift_end))
    throw new Error('Add both start and end times for each shift, or remove the slot.');
  return shifts;
}
function locations() {
  const shown = state.locations.filter(
    (l) => !state.locationQuery || (l.name + ' ' + l.area).toLowerCase().includes(state.locationQuery.toLowerCase()),
  );
  const empty = state.locationQuery ? 'No locations match.' : 'No locations yet.';
  const tools =
    uiRole() === 'admin'
      ? `${[
          ['add', 'Add location', 'Create a new branch'],
          ['import', 'Import locations', 'Upload a CSV location list'],
        ]
          .map(
            ([k, t, d]) =>
              `<button class="navLink" data-locaction="${k}"><span><strong>${t}</strong><small>${d}</small></span><span>›</span></button>`,
          )
          .join(
            '',
          )}<input type="file" id="importLocationFile" accept=".csv,text/csv" style="display:none">${state.showLocationForm ? `<div class="card addCard"><strong>Add location</strong><p>Create a branch supervisors can record attendance for.</p><form id="locationForm"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Area</label><input name="area" required></div>${shiftFields()}${locationSupervisorField()}<button class="secondary" ${!Array.isArray(state.settings?.access) ? 'disabled' : ''}>Save location</button></form></div>` : ''}`
      : '';
  return `<div class="page">${header()}<h1>Locations</h1><p class="sub">${uiRole() === 'admin' ? 'Select, add or import the branch where you are recording attendance. Tap a branch for its shift and employees.' : 'View your assigned branches, their shifts and employees.'}</p>${tools}<input class="search" id="locSearch" placeholder="Search locations" value="${esc(state.locationQuery)}"><div id="locationList">${shown.map((l) => `<button class="locationCard ${state.location?.id === l.id ? 'active' : ''} ${l.active ? '' : 'disabledCard'}" data-loc="${esc(l.id)}"><span class="locIcon">${uiIcon('locations')}</span><span><strong>${esc(l.name)} ${l.active ? '' : '<span class="badge grey">Disabled</span>'}</strong><span>${esc(l.area)} · ${empCountLabel(l)} · ${esc(shiftLabel(l))}</span></span><span class="chev">›</span></button>`).join('') || `<p class="muted small">${empty}</p>`}</div><button class="primary" id="continueLoc" ${state.location ? '' : 'disabled'}>Continue</button><p class="helper">You can switch locations later</p></div>${nav()}${message()}`;
}
// Location detail: shift timing and assigned employees, visible to admins and supervisors.
function locationDetail() {
  const d = state.detail;
  if (!d)
    return `<div class="page">${header()}<h1>Location</h1><p class="muted small">No location selected.</p><button class="link" data-go="locations">Back to locations</button></div>${nav()}${message()}`;
  const l = d.location;
  const isAdmin = uiRole() === 'admin';
  const emps = d.employees;
  const empButton = (e) =>
    !isAdmin || !l.active
      ? ''
      : e.active
        ? `<button class="outlineBtn dangerText" data-del-emp="${esc(e.id)}" data-name="${esc(e.name)}">Disable</button>`
        : `<button class="outlineBtn" data-en-emp="${esc(e.id)}" data-name="${esc(e.name)}">Enable</button>`;
  const editing = isAdmin && state.shiftDraft !== null;
  const shifts = locationShifts(l);
  const shiftSummary = `<div class="sectionHead"><h2>Shift timings</h2>${isAdmin ? '<button class="outlineBtn" id="toggleShiftEdit">Edit shifts</button>' : '<span class="muted small">IST</span>'}</div>${shifts.map((r, i) => `<div class="shiftSummary"><span class="muted small">${esc(r.label || 'Slot ' + (i + 1))} · IST</span><div class="shiftTimes"><div><small>Start time</small><strong>${fmtShift(r.shift_start)}</strong></div><div><small>End time</small><strong>${fmtShift(r.shift_end)}</strong></div></div>${r.shift_end < r.shift_start ? '<p class="muted small">Ends the next day</p>' : ''}</div>`).join('') || '<p class="muted small">No shift set. An admin can add shift timings.</p>'}`;
  const shiftEditor = editing
    ? `<form id="shiftEditForm"><div class="sectionHead"><h2>Edit shifts</h2><span class="muted small" id="shiftCount">${state.shiftDraft.length}/${MAX_SHIFT_SLOTS}</span></div><p class="muted small">All times are in IST. An earlier end time ends the next day.</p><fieldset ${state.shiftSaving ? 'disabled' : ''}>${shiftFields(state.shiftDraft, false)}${state.shiftError ? `<div class="inlineError" role="alert">${esc(state.shiftError)}</div>` : ''}<div class="formActions"><button type="button" class="secondary" id="cancelShiftEdit">Cancel</button><button class="primary">${state.shiftSaving ? 'Saving…' : 'Save shifts'}</button></div></fieldset></form>`
    : '';
  return `<div class="page"><div class="top"><button class="link backLink" data-go="locations">‹ Locations</button><span class="brand">Guardian</span></div><h1>${esc(l.name)} ${l.active ? '' : '<span class="badge grey">Disabled</span>'}</h1><p class="sub">${esc(l.area)} · ${empCountLabel(l)}${l.active ? '' : ' · New attendance is off. History is kept.'}</p><section class="card detailCard">${editing ? shiftEditor : shiftSummary}</section>${
    editing
      ? ''
      : `<section class="card detailCard"><h2>Employees at this location</h2>${
          emps === null
            ? '<p class="muted small" role="status">Loading employees…</p>'
            : emps
                .map(
                  (e) =>
                    `<div class="person ${e.active && l.active ? '' : 'disabledRow'}"><span class="initials">${esc(initials(e.name))}</span><span><strong>${esc(e.name)} ${e.active && l.active ? '' : '<span class="badge grey">Disabled</span>'}</strong><small>${esc(e.id)} · ${esc(e.role)}</small></span>${empButton(e)}</div>`,
                )
                .join('') ||
              '<div class="quietEmpty"><strong>No employees assigned yet</strong><p>Assigned employees will appear here.</p></div>'
        }</section>${l.active ? `<button class="primary" data-use-loc="${esc(l.id)}">Mark attendance here</button>` : '<p class="helper">Enable this location to mark attendance here again.</p>'}${isAdmin ? `<details class="locationSettings"><summary>Location settings</summary><p class="muted small">${l.active ? 'Disable new attendance at this location. Existing records are kept.' : 'Enable this location to record attendance again.'}</p>${l.active ? `<button class="outlineBtn dangerText" data-del-loc="${esc(l.id)}" data-name="${esc(l.name)}">Disable location</button>` : `<button class="outlineBtn" data-en-loc="${esc(l.id)}" data-name="${esc(l.name)}">Enable location</button>`}</details>` : ''}`
  }</div>${nav()}${message()}`;
}
function attendanceLocationPicker() {
  const usable = state.locations.filter((l) => l.active);
  return `<div class="recordingAt"><label for="attendanceLocation">Recording at</label>${usable.length > 1 ? `<select id="attendanceLocation">${usable.map((l) => `<option value="${esc(l.id)}" ${state.location?.id === l.id ? 'selected' : ''}>${esc(l.name)} · ${esc(l.area)}</option>`).join('')}</select>` : `<strong>${esc(state.location?.name || '')}${state.location?.area ? ' · ' + esc(state.location.area) : ''}</strong>`}</div>`;
}
function attendance() {
  const s = state.summary || {};
  const rows = state.attendance;
  if (!state.location)
    return `<div class="page">${header()}<h1>Mark attendance</h1><p class="sub">${fmtDate(istNow())}</p><div class="card addCard"><strong>${uiRole() === 'admin' ? 'No location set up yet' : 'No location access assigned'}</strong><p>${uiRole() === 'admin' ? 'Attendance is recorded per branch. Add a location first, then mark check-ins here.' : 'Your admin needs to give you location access before you can view employees or mark attendance.'}</p>${uiRole() === 'admin' ? '<button class="primary" data-go="locations">Go to Locations</button>' : ''}</div></div>${nav()}${message()}`;
  const canEditTimes = uiRole() === 'admin';
  return `<div class="page">${header()}<h1>Mark attendance</h1><p class="sub">${fmtDate(istNow())} · Times in IST</p>${attendanceLocationPicker()}${editTimeForm()}<div class="stats"><div class="stat green"><strong>${s.checked_in || 0}</strong><span>Checked in</span></div><div class="stat amber"><strong>${s.not_in || 0}</strong><span>To check in</span></div><div class="stat blue"><strong>${s.completed || 0}</strong><span>Checked out</span></div></div><input class="search" aria-label="Search employee attendance" id="attSearch" placeholder="Search by name or employee ID" value="${esc(state.query)}"><div class="filters"><button class="chip ${state.filter === 'all' ? 'active' : ''}" data-filter="all">All</button><button class="chip green ${state.filter === 'checked_in' ? 'active' : ''}" data-filter="checked_in">Checked in</button><button class="chip amber ${state.filter === 'not_in' ? 'active' : ''}" data-filter="not_in">To check in</button><button class="chip ${state.filter === 'completed' ? 'active' : ''}" data-filter="completed">Checked out</button></div><div class="attendanceList">${rows.map((r) => `<div class="person"><span class="initials">${esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.employee_id)}</small></span><span class="personTime">${r.check_in ? fmtTime(r.check_in) : '-'}<br><span class="badge ${r.status === 'checked_in' ? 'green' : r.status === 'completed' ? 'blue' : 'amber'}">${r.status === 'checked_in' ? 'Checked in' : r.status === 'completed' ? 'Checked out' : 'Not checked in'}</span></span>${canEditTimes && r.status !== 'not_in' ? `<button class="iconBtn" aria-label="Edit times for ${esc(r.name)}" title="Edit times" data-edittime="${esc(r.id || r.employee_id)}">${uiIcon('edit')}</button>` : ''}</div>`).join('') || '<p class="muted small">No employees match.</p>'}</div><button class="primary" data-go="add">Check in employee</button><button class="secondary" style="margin-top:10px" data-go="checkout">Manage check-outs</button></div>${nav()}${message()}`;
}
// Admin-only correction of an existing record's check-in/check-out times (IST).
function editTimeForm() {
  const r = state.editTimes;
  if (!r) return '';
  return `<div class="card addCard" id="timeEditCard"><strong>Edit times - ${esc(r.name)}</strong><p class="muted small">Only admins can modify attendance times. Times are Indian Standard Time. Each correction is saved with your reason in the activity log. Shifts over 24 hours are unusual - double-check the dates.</p><form id="timeEditForm"><div class="field"><label>Date</label><input name="day" type="date" value="${todayISO()}" required></div><div class="field"><label>Check-in time (IST)</label><input name="check_in" type="time" value="${toHHMM(r.check_in)}" required></div><div class="field"><label>Check-out time (IST, leave empty if still working)</label><input name="check_out" type="time" value="${toHHMM(r.check_out)}"></div><div class="field"><label>Check-out date (IST, pick the next day for overnight shifts)</label><input name="check_out_day" type="date" value="${todayISO()}"></div><div class="field"><label>Reason for the correction</label><input name="reason" placeholder="Example: guard forgot to check out" minlength="3" maxlength="200" required></div><button class="secondary">Save times</button> <button type="button" class="link" id="cancelTimeEdit">Cancel</button></form></div>`;
}
// One search per marking screen: the box filters this site's list live and also finds
// ANY active employee by name or EMP ID (ad hoc included). Eligibility stays explicit:
// disabled, already-marked, or not-checked-in-here people show their status, never an
// action button.
function lookupResultsView(kind) {
  const q = (kind === 'checkin' ? state.addQuery : state.outQuery).trim();
  const r = state.lookupResults;
  if (!q || !r) return '';
  const rows = r
    .filter((emp) => {
      const today =
        state.attendance.find((a) => a.employee_id === emp.id && a.status === 'checked_in') ||
        state.attendance.find((a) => a.employee_id === emp.id);
      if (kind === 'checkin') return !(today && today.status === 'not_in'); // already in the waiting list below
      const checkedInHere =
        (today && today.status === 'checked_in') || (state.staleOpen || []).some((a) => a.employee_id === emp.id);
      return !checkedInHere; // already in the checked-in lists below
    })
    .map((emp) => lookupCandidateRow(kind, emp))
    .join('');
  return `<h2 class="sectionTitle">Other employees matching "${esc(q)}"</h2>${rows || '<p class="muted small">No other employees match.</p>'}`;
}
function lookupCandidateRow(kind, emp) {
  const meta = `${esc(emp.id)}${emp.location_name ? ' · ' + esc(emp.location_name) : ''}`;
  const note = (t) =>
    `<div class="person disabledRow"><span class="initials">${esc(initials(emp.name))}</span><span><strong>${esc(emp.name)}</strong><small>${meta} · ${t}</small></span></div>`;
  if (kind === 'checkout') return note('Not checked in at this location');
  if (!emp.active) return note('Disabled - an admin can enable them');
  const today =
    state.attendance.find((a) => a.employee_id === emp.id && a.status === 'checked_in') ||
    state.attendance.find((a) => a.employee_id === emp.id);
  if (today && today.status === 'checked_in') return note('Already checked in here');
  return `<div class="person"><span class="initials">${esc(initials(emp.name))}</span><span><strong>${esc(emp.name)}${emp.location_id !== state.location.id ? ' <span class="badge blue">ad-hoc</span>' : ''}</strong><small>${meta}</small></span><button class="outlineBtn" data-checkin="${esc(emp.id)}">Check in</button></div>`;
}
// Check-in mirrors Manage check-outs: every waiting employee gets a direct Check in
// button on their row, no select step. Tapping it opens the same style of
// confirmation dialog check-out uses, showing the IST check-in time.
function add() {
  const waiting = state.attendance.filter(
    (r) =>
      r.status !== 'checked_in' &&
      !state.attendance.some((a) => a.employee_id === r.employee_id && a.status === 'checked_in') &&
      state.attendance.find((a) => a.employee_id === r.employee_id) === r,
  );
  const available = waiting.filter(
    (r) => !state.addQuery || (r.name + ' ' + r.employee_id).toLowerCase().includes(state.addQuery.toLowerCase()),
  );
  return `<div class="page">${header()}<h1>Employee check-in</h1><p class="sub">Start a waiting employee's shift. Times in IST.</p>${attendanceLocationPicker()}<div class="hero"><small>READY FOR CHECK-IN</small><strong>${waiting.length}</strong> <span>${waiting.length === 1 ? 'employee' : 'employees'}</span></div><input class="search" id="addSearch" placeholder="Search name or EMP ID, e.g. EMP1024" value="${esc(state.addQuery)}" autocomplete="off">${lookupResultsView('checkin')}<h2 class="sectionTitle">Ready for check-in</h2>${available.map((r) => `<div class="person"><span class="initials">${esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.employee_id)}${r.adhoc ? ' · ad-hoc' : ''}</small></span><button class="outlineBtn" data-checkin="${esc(r.employee_id)}">Check in</button></div>`).join('') || '<p class="muted small">No waiting employees match.</p>'}${uiRole() === 'admin' ? `<div class="card addCard"><strong>Can't find the employee?</strong><p>Add a new employee to this location.</p><button class="link" id="toggleNew">+ Create new employee</button><form id="newEmployee" style="display:none;margin-top:14px"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Phone</label><input name="phone" required></div><button class="secondary">Save employee</button></form></div>` : '<p class="muted small">Only admins can create employees. Contact your admin if an employee is missing.</p>'}<p style="text-align:center;margin-top:16px"><button class="link" data-go="attendance">Back to attendance list</button></p></div>${nav()}${message()}`;
}
function checkout() {
  const staleAll = state.staleOpen || [];
  const checkedIn = state.attendance.filter((r) => r.status === 'checked_in');
  const matchOut = (r) =>
    !state.outQuery || (r.name + ' ' + r.employee_id).toLowerCase().includes(state.outQuery.toLowerCase());
  const stale = staleAll.filter(matchOut);
  const rows = checkedIn.filter(matchOut);
  const total = checkedIn.length + staleAll.length;
  const person = (r, extra) =>
    `<div class="person"><span class="initials">${esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.employee_id)} · In: ${fmtTime(r.check_in)}${extra}</small></span><button class="outlineBtn" data-checkout="${esc(r.employee_id)}">Check out</button></div>`;
  const staleList = stale.length
    ? `<h2 class="sectionTitle">Left open from earlier days</h2><p class="muted small">These check-ins were never closed. Check out each one, then an admin can fix the times with a reason.</p>${stale.map((r) => person(r, ` · since ${esc(r.day)}`)).join('')}`
    : '';
  return `<div class="page">${header()}<h1>Manage check-outs</h1><p class="sub">Close a checked-in shift. Times in IST.</p>${attendanceLocationPicker()}<div class="hero"><small>STILL CHECKED IN</small><strong>${total}</strong> <span>${total === 1 ? 'employee' : 'employees'}</span></div><input class="search" id="outSearch" placeholder="Search name or EMP ID" value="${esc(state.outQuery)}" autocomplete="off">${lookupResultsView('checkout')}${rows.map((r) => person(r, '')).join('') || (stale.length ? '' : '<p class="muted small">' + (state.outQuery ? 'No checked-in employees match.' : 'No checked-in employees remain.') + '</p>')}${staleList}<p style="text-align:center;margin-top:18px"><button class="link" data-go="attendance">View attendance list</button></p></div>${nav()}${message()}`;
}
async function dashboard() {
  if (!state.dashboard) state.dashboard = await api('/api/dashboard');
  const d = state.dashboard;
  // "All" adds up every location this account can see; picking one location shows only its numbers.
  const locs = d.locations;
  const pick = locs.find((l) => l.id === state.overviewLocation) || null;
  const t = pick
    ? {
        employees: pick.today.checked_in + pick.today.completed + pick.today.not_in,
        checked_in: pick.today.checked_in,
        completed: pick.today.completed,
        not_checked_in: pick.today.not_in,
      }
    : d;
  const short = (l) => l.name.split(' - ')[1] || l.name;
  const chips = `<div class="recordingAt overviewPicker"><label for="overviewLocation">Location</label><select id="overviewLocation"><option value="">All locations</option>${locs.map((l) => `<option value="${esc(l.id)}" ${pick?.id === l.id ? 'selected' : ''}>${esc(short(l))}</option>`).join('')}</select></div>`;
  const card = (l) =>
    `<button type="button" class="card listCard locCard ${l.active ? '' : 'disabledCard'}" data-overview-loc="${esc(l.id)}"><span><strong>${esc(short(l))} ${l.active ? '' : '<span class="badge grey">Disabled</span>'}</strong><small>${empCountLabel(l)}</small></span><span style="text-align:right"><span class="badge green">${l.today.checked_in} checked in</span><small>${l.today.completed} checked out</small><small>${l.today.not_in} not checked in</small></span></button>`;
  return `<div class="page">${header()}<h1>Attendance overview</h1><p class="sub">Today's summary · ${pick ? esc(short(pick)) : 'all assigned locations'}</p>${chips}<div class="grid2"><div class="dashStat"><strong>${t.employees}</strong><span>Employees</span></div><div class="dashStat"><strong style="color:var(--green)">${t.checked_in}</strong><span>Checked in</span></div><div class="dashStat"><strong>${t.completed}</strong><span>Checked out</span></div><div class="dashStat"><strong style="color:var(--amber)">${t.not_checked_in}</strong><span>Not checked in</span></div></div><h2 class="sectionTitle">${pick ? 'Location' : 'Location breakdown'}</h2>${(pick ? [pick] : locs).map(card).join('') || '<p class="muted small">No locations yet.</p>'}</div>${nav()}${message()}`;
}
function menu() {
  return `<div class="page">${header()}<h1>Account</h1><p class="sub">${esc(state.user?.name || '')}</p><div class="person accountIdentity"><span class="initials">${esc(initials(state.user?.name || 'User'))}</span><span><strong>${esc(state.user?.name || '')}</strong><small>${esc(state.user?.id || '')} · ${esc(state.user?.role === 'owner' ? 'owner' : uiRole() || '')}</small></span></div><button class="secondary" id="logout" style="margin-top:18px">Sign out</button></div>${nav()}${message()}`;
}

function employees() {
  // Location filter: '' is every site the role may see, 'none' is employees not
  // placed anywhere yet (admin only). A stale pick resets to all: the site was
  // removed, or an admin's 'none' survived into a non-admin session.
  if (
    state.employeeLocation &&
    (state.employeeLocation === 'none'
      ? uiRole() !== 'admin'
      : !state.locations.some((l) => l.id === state.employeeLocation))
  )
    state.employeeLocation = '';
  const shown = state.employees.filter(
    (e) =>
      (!state.employeeLocation ||
        (state.employeeLocation === 'none' ? !e.location_id : e.location_id === state.employeeLocation)) &&
      (!state.employeeQuery ||
        (e.name + ' ' + e.id + ' ' + e.role).toLowerCase().includes(state.employeeQuery.toLowerCase())),
  );
  // The dropdown reuses the shared .search field style so it matches the box above it.
  const locFilter = `<select class="search" id="empLocFilter" aria-label="Filter employees by location"><option value=""${
    state.employeeLocation === '' ? ' selected' : ''
  }>All locations</option>${[...state.locations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (l) =>
        `<option value="${esc(l.id)}"${state.employeeLocation === l.id ? ' selected' : ''}>${esc(l.name)}${
          l.active ? '' : ' (Disabled)'
        }</option>`,
    )
    .join('')}${
    uiRole() === 'admin'
      ? `<option value="none"${state.employeeLocation === 'none' ? ' selected' : ''}>No location yet</option>`
      : ''
  }</select>`;
  const locationName = (id) => (id ? state.locations.find((l) => l.id === id)?.name || id : 'No location yet');
  // A disabled location makes its employees effectively disabled: greyed, no new attendance.
  const locationActive = (id) => {
    const loc = id ? state.locations.find((l) => l.id === id) : null;
    return loc ? !!loc.active : true;
  };
  const empRow = (e) => {
    const enabled = e.active && locationActive(e.location_id);
    const action =
      uiRole() !== 'admin' || !locationActive(e.location_id)
        ? ''
        : e.active
          ? `<button class="outlineBtn dangerText" data-del-emp="${esc(e.id)}" data-name="${esc(e.name)}">Disable</button>`
          : `<button class="outlineBtn" data-en-emp="${esc(e.id)}" data-name="${esc(e.name)}">Enable</button>`;
    return `<div class="person ${enabled ? '' : 'disabledRow'}"><span class="initials">${esc(initials(e.name))}</span><span><strong>${esc(e.name)} ${enabled ? '' : '<span class="badge grey">Disabled</span>'}</strong><small>${esc(e.id)} · ${esc(e.role)} · ${esc(locationName(e.location_id))}</small></span>${action}</div>`;
  };
  const form =
    uiRole() === 'admin' && state.showEmployeeForm
      ? `<div class="card addCard"><strong>Add employee</strong><p>Create an employee record. Location is optional and can be assigned later.</p><form id="employeeForm"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Phone</label><input name="phone" required></div><div class="field"><label>Location (optional)</label><select name="location_id"><option value="" selected>Assign location later</option>${state.locations.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div><button class="secondary">Save employee</button></form></div>`
      : '';
  return `<div class="page">${header()}<h1>Employees</h1><p class="sub">${uiRole() === 'admin' ? 'Browse and manage people assigned to your locations.' : 'View employees assigned to your locations. Admins manage employee records.'}</p>${[
    ...(uiRole() === 'admin'
      ? [
          ['add', 'Add employee', 'Create a new employee record'],
          ['import', 'Import employees', 'Upload a CSV staff list'],
        ]
      : []),
  ]
    .map(
      ([k, t, d]) =>
        `<button class="navLink" data-emp="${k}"><span><strong>${t}</strong><small>${d}</small></span><span>›</span></button>`,
    )
    .join(
      '',
    )}${uiRole() === 'admin' ? '<input type="file" id="importFile" accept=".csv,text/csv" style="display:none">' : ''}${form}<input class="search" id="empSearch" placeholder="Search name, role or employee ID" value="${esc(state.employeeQuery)}">${locFilter}<div id="directoryList">${shown.map(empRow).join('') || '<p class="muted small">No employees match.</p>'}</div></div>${nav()}${message()}`;
}
// Reports screen: Day / Month / History tabs. Everything it shows comes from
// state.report; loadReport() fetches the data for the open tab.
const STATUS_LABEL = { checked_in: 'Checked in', completed: 'Checked out', not_in: 'Not checked in' };
const STATUS_TONE = { checked_in: 'green', completed: 'blue', not_in: 'amber' };
const shortLoc = (name) => (name || '').split(' - ')[1] || name || '';
const locCity = (name) => ((name || '').includes(' - ') ? name.split(' - ')[0] : '');
const fmtShortDay = (iso) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(iso + 'T00:00:00'),
  );
const fmtShortMonth = (ym) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(ym + '-01T00:00:00'));
const fmtCount = (n) => Number(n || 0).toLocaleString('en-IN');
const svgIcon = (d, size = 18, width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  download: svgIcon('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  calendar: svgIcon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  pin: svgIcon('<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>'),
  chevDown: svgIcon('<path d="M6 9l6 6 6-6"/>', 16),
  chevRight: svgIcon('<path d="M9 6l6 6-6 6"/>'),
  back: svgIcon('<path d="M15 6l-6 6 6 6"/>', 20, 2.2),
  close: svgIcon('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: svgIcon('<path d="M5 12l5 5 9-10"/>', 22, 2.4),
  retry: svgIcon('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  wifiOff: svgIcon(
    '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18"/>',
    30,
    1.8,
  ),
  emptyDay: svgIcon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', 30, 1.8),
  chart: svgIcon('<path d="M5 20V10M12 20V4M19 20v-7"/>', 30, 1.8),
  emptyPin: svgIcon(
    '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    30,
    1.8,
  ),
};
function reportDefaults() {
  const today = todayISO();
  return {
    tab: 'day',
    date: today,
    month: today.slice(0, 7),
    dayLocation: state.location?.id || state.locations[0]?.id || '',
    monthLocation: '',
    status: 'all',
    detail: '',
    sheet: false,
    loading: false,
    error: '',
    loadedAt: '',
    day: null,
    summary: null,
    detailData: null,
    history: null,
    seq: 0,
  };
}
function progress(done, total) {
  const pct = total ? Math.round((done * 100) / total) : 0;
  return { pct, bar: `<div class="rpBar" aria-hidden="true"><span style="width:${pct}%"></span></div>` };
}
function emptyState(icon, title, text, cta = '', tone = '') {
  return `<div class="rpEmpty ${tone}" ${tone === 'rpError' ? 'role="alert"' : ''}><span class="rpEmptyIcon">${icon}</span><h2>${esc(title)}</h2><p>${esc(text)}</p>${cta}</div>`;
}
function reportError(r) {
  const choose = '<button class="secondary rpCta" data-rchoose>Choose location</button>';
  if (r.errorStatus === 403)
    return emptyState(
      ICON.emptyPin,
      'No access to this location',
      'Ask an admin for access, or choose another location.',
      choose,
    );
  if (r.errorStatus === 404)
    return emptyState(
      ICON.emptyPin,
      'Location not found',
      'This location no longer exists. Choose another location.',
      choose,
    );
  if (r.errorStatus === 400 || r.errorStatus === 422)
    return emptyState(
      ICON.emptyDay,
      'Could not show this report',
      r.error,
      '<button class="primary rpCta" data-rtoday>Go to today</button>',
      'rpError',
    );
  return emptyState(
    ICON.wifiOff,
    'Could not load the report',
    friendlyError(r.errorStatus, r.error) + ' Your filters stay the same.',
    `<button class="primary rpCta" data-rretry>${ICON.retry}Try again</button>${r.loadedAt ? `<small>Last loaded at ${esc(r.loadedAt)}</small>` : ''}`,
    'rpError',
  );
}
function skeletonRows(n) {
  return `<div class="rpList" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<div class="rpRow"><span class="rpSkel round"></span><span class="rpWho"><span class="rpSkel" style="width:${[120, 96, 132, 84, 110, 100, 126][i % 7]}px;height:12px"></span><span class="rpSkel" style="width:64px;height:10px;margin-top:6px"></span></span><span class="rpWhen"><span class="rpSkel" style="width:66px;height:12px"></span><span class="rpSkel" style="width:52px;height:18px;border-radius:9px"></span></span></div>`).join('')}</div>`;
}
function reportSkeleton(r) {
  const loc = state.locations.find((l) => l.id === (r.tab === 'day' ? r.dayLocation : r.detail || r.monthLocation));
  const what = r.tab === 'history' ? 'the history' : `the ${loc ? shortLoc(loc.name) + ' ' : ''}report`;
  const head =
    r.tab === 'day'
      ? `<div class="rpStats" aria-hidden="true">${'<div class="rpStat"><span class="rpSkel" style="width:34px;height:16px"></span><span class="rpSkel" style="width:48px;height:10px;margin-top:8px"></span></div>'.repeat(4)}</div>`
      : '';
  return `${head}<p class="rpHint" role="status">Loading ${esc(what)}…</p>${skeletonRows(r.tab === 'day' ? 7 : 5)}`;
}
function reportFilters(r) {
  const isDay = r.tab === 'day';
  const locId = isDay ? r.dayLocation : r.monthLocation;
  const loc = state.locations.find((l) => l.id === locId);
  const locLabel = loc ? shortLoc(loc.name) : isDay ? 'Choose location' : 'All locations';
  // The real date/month input lies over the button (invisible), so a tap opens the
  // browser's own picker on every phone. A hidden input plus showPicker() does not
  // work in many mobile browsers.
  return `<div class="rpFilters"><label class="rpPeriod"><span class="rpSelect" aria-hidden="true">${ICON.calendar}<span>${esc(isDay ? fmtShortDay(r.date) : fmtShortMonth(r.month))}</span>${ICON.chevDown}</span><input class="rpPeriodInput" id="reportPeriod" type="${isDay ? 'date' : 'month'}" value="${esc(isDay ? r.date : r.month)}" aria-label="${isDay ? 'Change date' : 'Change month'}"></label><button class="rpSelect" id="reportLocation" aria-haspopup="dialog" aria-label="Change location">${ICON.pin}<span>${esc(locLabel)}</span>${ICON.chevDown}</button></div>`;
}
function guardRow(x) {
  const time =
    x.status === 'completed'
      ? `${fmtTime(x.check_in)} – ${fmtTime(x.check_out)}`
      : x.status === 'checked_in'
        ? 'In ' + fmtTime(x.check_in)
        : '—';
  const badge =
    x.status === 'completed' && x.hours
      ? `Checked out · ${Number(x.hours).toFixed(1)} h`
      : STATUS_LABEL[x.status] || x.status;
  return `<div class="rpRow"><span class="rpAvatar ${x.status === 'not_in' ? 'amber' : ''}" aria-hidden="true">${esc(initials(x.employee_name))}</span><span class="rpWho"><strong>${esc(x.employee_name)}</strong><small>${esc(x.employee_id)}</small></span><span class="rpWhen"><span>${time}</span><span class="badge ${STATUS_TONE[x.status] || 'blue'}">${esc(badge)}</span></span></div>`;
}
function dayReport(r) {
  if (!r.dayLocation)
    return emptyState(ICON.emptyPin, 'No location yet', 'You need access to a location before you can see a report.');
  const rows = r.day?.rows || [];
  if (!rows.length && r.date === todayISO()) {
    // Today's Day report lists every active guard of the location, also guards with no
    // record. So an empty list today means that the location has no active guards.
    const loc = state.locations.find((l) => l.id === r.dayLocation);
    return emptyState(
      ICON.emptyPin,
      'No guards at this location',
      `${loc ? shortLoc(loc.name) : 'This location'} has no active guards. Choose another location, or add guards in Employees.`,
      '<button class="secondary rpCta" data-rchoose>Choose location</button>',
    );
  }
  if (!rows.length) {
    const future = r.date > todayISO();
    return emptyState(
      ICON.emptyDay,
      future ? 'No attendance for this day yet' : 'No attendance records',
      future
        ? `${fmtDate(new Date(r.date + 'T00:00:00'))} is in the future. Records show here when guards check in.`
        : 'Nobody checked in at this location on this day.',
      r.date !== todayISO() ? '<button class="primary rpCta" data-rtoday>Go to today</button>' : '',
    );
  }
  const count = (s) => rows.filter((x) => s === 'all' || x.status === s).length;
  const stats = [
    ['all', 'All entries'],
    ['checked_in', 'Checked in'],
    ['completed', 'Checked out'],
    ['not_in', 'Not checked in'],
  ]
    .map(
      ([k, l]) =>
        `<button class="rpStat ${k} ${r.status === k ? 'active' : ''}" data-rstatus="${k}" aria-pressed="${r.status === k}"><strong>${count(k)}</strong><span>${l}</span></button>`,
    )
    .join('');
  const shown = rows.filter((x) => r.status === 'all' || x.status === r.status);
  const hours = rows.map((x) => x.hours).filter(Boolean);
  const avg = hours.length ? (hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1) : '';
  // A guard can have several sequential shifts. Rows are entries, not people.
  const guardCount = new Set(rows.map((x) => x.employee_id)).size;
  const title =
    r.status === 'all'
      ? `${plural(guardCount, 'guard')} · ${plural(rows.length, 'entry', 'entries')}`
      : `${plural(shown.length, 'entry', 'entries')} · ${STATUS_LABEL[r.status].toLowerCase()}`;
  const side =
    r.status !== 'all'
      ? '<button class="link" data-rstatus="all">Show all</button>'
      : avg
        ? `<span>Avg shift ${avg} h</span>`
        : '';
  return `<div class="rpStats" role="group" aria-label="Filter attendance entries by status">${stats}</div><p class="rpHint">Figures count entries, not unique guards. Tap to filter.</p><div class="rpListHead"><strong>${esc(title)}</strong>${side}</div><div class="rpList">${shown.map(guardRow).join('') || '<p class="rpNone">Nobody in this group.</p>'}</div>`;
}
function monthSummary(t) {
  const p = progress(t.completed, t.records);
  const open = t.records - t.completed;
  const sub = `${open ? `<strong class="rpOpen">${fmtCount(open)} open</strong>` : 'Nothing open'}${t.avg_hours ? ` · avg shift ${t.avg_hours.toFixed(1)} h` : ''}`;
  return `<div class="rpSummary"><div class="rpSummaryLine"><span>${fmtCount(t.completed)} of ${fmtCount(t.records)} completed</span><span>${p.pct}%</span></div>${p.bar}<small>${sub}</small></div>`;
}
function monthReport(r) {
  const s = r.summary;
  const t = s?.totals;
  if (!t || !t.records)
    return emptyState(
      ICON.chart,
      'No attendance this month',
      'Records show here when guards check in.',
      r.month !== todayISO().slice(0, 7) ? '<button class="primary rpCta" data-rtoday>Go to this month</button>' : '',
    );
  const cards = s.locations
    .map((l) => {
      const lp = progress(l.completed, l.records);
      const city = locCity(l.name);
      return `<button class="rpLoc" data-rdetail="${esc(l.id)}"><span class="rpLocHead"><span><strong>${esc(shortLoc(l.name))}</strong><small>${esc((city ? city + ' · ' : '') + empCountLabel(l, 'guard'))}</small></span><span class="badge ${l.records && lp.pct === 100 ? 'green' : l.records ? 'amber' : 'blue'}">${l.records ? lp.pct + '%' : 'No records'}</span>${ICON.chevRight}</span>${lp.bar}<span class="rpFigures"><span><strong>${fmtCount(l.records)}</strong>Records</span><span><strong>${fmtCount(l.records - l.completed)}</strong>Open</span><span><strong>${l.avg_hours ? l.avg_hours.toFixed(1) + ' h' : '–'}</strong>Avg shift</span></span></button>`;
    })
    .join('');
  return `${monthSummary(t)}<h2 class="rpSection">By location</h2>${cards}`;
}
function reportDetail(r) {
  const d = r.detailData;
  const loc = state.locations.find((l) => l.id === r.detail);
  const assigned = loc?.assigned_count || 0;
  const city = locCity(loc?.name);
  const canExport = !r.loading && !r.error && d?.totals?.records;
  const top = `<div class="rpBackBar"><button class="rpBack" data-rback>${ICON.back}All locations</button><button class="rpExport" id="reportExport" ${canExport ? '' : 'disabled'}>${ICON.download}Excel</button></div><h1 class="rpDetailTitle">${esc(loc ? shortLoc(loc.name) : 'Location')}</h1><p class="rpDetailSub">${esc((city ? city + ' · ' : '') + plural(assigned, 'guard') + ' · ' + fmtMonth(new Date(r.month + '-01T00:00:00')))}</p>`;
  if (r.loading) return top + `<p class="rpHint" role="status">Loading the days…</p>` + skeletonRows(7);
  if (r.error) return top + reportError(r);
  if (!d?.totals?.records)
    return top + emptyState(ICON.chart, 'No attendance this month', 'Records show here when guards check in.');
  const today = todayISO();
  const days = d.days
    .map((x) => {
      const dt = new Date(x.day + 'T00:00:00');
      const present = x.completed + x.checked_in;
      const open = x.checked_in || x.not_in;
      const missing = assigned - x.records;
      const sub = open
        ? `${x.completed} completed · ${x.checked_in} checked in · ${x.not_in} not checked in`
        : `All shifts completed${missing > 0 ? ` · ${missing} no record` : ''}`;
      return `<button class="rpDay" data-rday="${esc(x.day)}"><span class="rpDate"><strong>${dt.getDate()}</strong><small>${new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(dt)}</small></span><span class="rpWho"><strong>${present} of ${assigned || x.records} present</strong><small>${esc(sub)}</small></span>${x.day === today ? '<span class="badge amber">Today</span>' : ''}${ICON.chevRight}</button>`;
    })
    .join('');
  return `${top}${monthSummary(d.totals)}<h2 class="rpSection">By day</h2><div class="rpList">${days}</div>`;
}
function historyReport(r) {
  const h = r.history || [];
  if (!h.some((m) => m.total_records))
    return emptyState(
      ICON.chart,
      'No history yet',
      'Monthly reports show here after the first month of attendance. You can see this month on the Month tab.',
      '<button class="secondary rpCta" data-rtab="month">Open this month</button>',
    );
  const current = todayISO().slice(0, 7);
  const rows = h
    .map((m) => {
      const p = progress(m.completed, m.total_records);
      const label = fmtMonth(new Date(m.month + '-01T00:00:00'));
      return `<div class="rpMonth"><span class="rpWho"><span class="rpMonthTitle"><strong>${label}</strong>${m.month === current ? '<span class="badge amber">In progress</span>' : ''}</span>${p.bar}<small>${fmtCount(m.completed)} of ${fmtCount(m.total_records)} records completed</small></span><button class="rpIconBtn" data-export="${esc(m.month)}" aria-label="Download ${label} as Excel" ${m.total_records ? '' : 'disabled'}>${ICON.download}</button></div>`;
    })
    .join('');
  return `<div class="rpListHead"><strong class="rpListTitle">Last 6 months</strong><span>${uiRole() === 'admin' ? 'All locations' : 'Your locations'}</span></div><div class="rpList">${rows}</div><p class="rpHint center">Each download is one Excel file for the whole month.</p>`;
}
function locationSheet(r) {
  const isDay = r.tab === 'day';
  const current = isDay ? r.dayLocation : r.monthLocation;
  const options = (isDay ? [] : [{ id: '', name: 'All locations', area: plural(state.locations.length, 'location') }])
    .concat(state.locations)
    .map((l) => {
      const on = l.id === current;
      const meta = l.id
        ? [locCity(l.name), l.area, empCountLabel(l, 'guard'), l.active ? '' : 'Disabled'].filter(Boolean).join(' · ')
        : l.area;
      return `<button role="radio" aria-checked="${on}" class="rpOption ${on ? 'active' : ''}" data-rloc="${esc(l.id)}"><span><strong>${esc(l.id ? shortLoc(l.name) : l.name)}</strong><small>${esc(meta)}</small></span>${on ? ICON.check : ''}</button>`;
    })
    .join('');
  return `<div class="rpScrim" data-rsheet-close></div><div class="rpSheet" role="dialog" aria-modal="true" aria-labelledby="rpSheetTitle"><span class="rpHandle" aria-hidden="true"></span><div class="rpSheetHead"><h2 id="rpSheetTitle">Choose location</h2><button class="rpClose" data-rsheet-close aria-label="Close">${ICON.close}</button></div>${uiRole() !== 'admin' ? '<p>You see only the locations assigned to you.</p>' : ''}<div role="radiogroup" aria-label="Location">${options}</div></div>`;
}
function reports() {
  const r = state.report || (state.report = reportDefaults());
  if (r.tab === 'month' && r.detail) return `<div class="page rp">${reportDetail(r)}</div>${nav()}${message()}`;
  const hasData = r.tab === 'day' ? r.day?.rows?.length : r.summary?.totals?.records;
  const canExport = !r.loading && !r.error && hasData;
  const tabs = [
    ['day', 'Day'],
    ['month', 'Month'],
    ['history', 'History'],
  ]
    .map(
      ([k, l]) =>
        `<button class="rpTab ${r.tab === k ? 'active' : ''}" data-rtab="${k}" ${r.tab === k ? 'aria-current="page"' : ''}>${l}</button>`,
    )
    .join('');
  const exportButton =
    r.tab === 'history'
      ? ''
      : `<button class="rpExport" id="reportExport" ${canExport ? '' : 'disabled'}>${ICON.download}Excel</button>`;
  const body = r.loading
    ? reportSkeleton(r)
    : r.error
      ? reportError(r)
      : r.tab === 'day'
        ? dayReport(r)
        : r.tab === 'month'
          ? monthReport(r)
          : historyReport(r);
  return `<div class="page rp">${header()}<div class="rpTitle"><h1>Reports</h1>${exportButton}</div><nav class="rpTabs" aria-label="Report type">${tabs}</nav>${r.tab === 'history' ? '' : reportFilters(r)}${body}</div>${r.sheet ? locationSheet(r) : ''}${nav()}${message()}`;
}
// Activity log (Settings > Activity log, admin only): readable labels for each recorded write.
const AUDIT_TITLES = {
  'attendance.checkin': 'Check-in',
  'attendance.checkout': 'Check-out',
  'attendance.times.edit': 'Time correction',
  'employee.create': 'Employee added',
  'employee.disable': 'Employee disabled',
  'employee.enable': 'Employee enabled',
  'employee.import': 'Employee import',
  'employee.transfer': 'Employee moved to another location',
  'settings.location.create': 'Location added',
  'settings.location.disable': 'Location disabled',
  'settings.location.enable': 'Location enabled',
  'settings.location.import': 'Location import',
  'settings.access.create': 'User access created',
  'settings.access.locations': 'Supervisor sites updated',
  'settings.access.disable': 'Supervisor access disabled',
  'settings.access.enable': 'Supervisor access enabled',
  'settings.profile.update': 'Profile updated',
};
const auditTitle = (a) => AUDIT_TITLES[a.action] || a.action;
const fmtAuditTime = (v) => (v ? fmtDate(new Date(v)) + ' · ' + fmtTime(v) : '');
function auditDetail(a) {
  const d = a.details || {};
  const labels = a.labels || {};
  const employee = labels.employee_name || d.employee_id || '';
  const location = labels.location_name || d.location_id || '';
  if (a.action === 'attendance.times.edit') return `${employee} · ${d.day || ''} · Reason: ${d.reason || 'not given'}`;
  if (a.action === 'attendance.checkout' && d.late_checkout)
    return `${employee} · ${location} · closed the record from ${d.record_day || 'an earlier day'}`;
  if (a.action === 'attendance.checkin' || a.action === 'attendance.checkout') return `${employee} · ${location}`;
  if (a.action === 'employee.transfer')
    return `${employee} · ${labels.from_name || d.from || 'no location'} to ${labels.to_name || d.to || 'no location'}`;
  if (a.action === 'employee.import' || a.action === 'settings.location.import')
    return `${d.created || 0} added · ${d.updated || 0} updated`;
  return employee || location || d.name || d.id || '';
}
function siteName(d, id) {
  const loc = (d.locations || []).find((l) => l.id === id);
  return loc ? loc.name : id;
}
function accessRow(u, d) {
  const isAdmin = uiRole() === 'admin';
  const disabled = u.active === 0;
  const scope =
    u.role === 'admin'
      ? 'All locations'
      : (u.location_ids || []).map((id) => siteName(d, id)).join(', ') || 'No sites assigned';
  const body = `<span class="accessTop"><span class="initials">${esc(
    initials(u.name),
  )}</span><span class="accessInfo"><strong>${esc(u.name)} ${
    disabled ? '<span class="badge grey">Disabled</span>' : ''
  }</strong><small>${esc(u.id)} · ${esc(u.role)}</small><small>${esc(scope)}</small></span>${isAdmin ? '<span class="chev" aria-hidden="true">›</span>' : ''}</span>`;
  // Admins open a user to see and change their locations; supervisors only read the list.
  if (isAdmin)
    return `<button type="button" class="person accessCard accessOpen ${disabled ? 'disabledRow' : ''}" data-open-access="${esc(u.id)}" aria-label="Open ${esc(u.name)}">${body}</button>`;
  return `<div class="person accessCard ${disabled ? 'disabledRow' : ''}">${body}</div>`;
}
// One user's own screen: who they are, which locations they can work at (add or remove),
// and disable/enable. Admin only; the server enforces the same rules.
// Location checkbox list shared by the user screen and the add-supervisor form.
function siteChecklist(d, assigned) {
  return `<div class="siteList">${
    d.locations
      .map(
        (l) =>
          `<label class="siteOption ${l.active ? '' : 'disabledRow'}"><input type="checkbox" name="location_ids" value="${esc(l.id)}" ${assigned.has(l.id) ? 'checked' : ''}><span class="siteText"><strong>${esc(l.name)}</strong><small>${esc(l.area)}${l.active ? '' : ' · Disabled'}</small></span></label>`,
      )
      .join('') || '<p class="muted small" style="padding:12px">No locations yet. Add one under Locations first.</p>'
  }</div>`;
}
function accessDetail(u, d) {
  const disabled = u.active === 0;
  const isSupervisor = u.role === 'supervisor';
  const assigned = new Set(u.location_ids || []);
  const identity = `<p class="accessMeta">${esc(u.id)} · ${esc(u.role)}${disabled ? ' <span class="badge grey">Disabled</span>' : ''}</p>`;
  const sites = isSupervisor
    ? `<form id="accessEditForm" data-user="${esc(u.id)}"><h2 class="sectionTitle">Locations</h2>${siteChecklist(d, assigned)}<button class="primary" style="margin-top:14px">Save locations</button></form>`
    : '<h2 class="sectionTitle">Locations</h2><p class="muted small">Admins can work at all locations.</p>';
  // Disable/enable sits apart from the everyday form, with its own confirmation dialog.
  const danger =
    isSupervisor && uiRole() === 'admin'
      ? `<div class="accessToggle">${
          disabled
            ? `<p class="muted small">Access is off. This user cannot sign in. History is kept.</p><button class="outlineBtn" data-en-access="${esc(u.id)}" data-name="${esc(u.name)}">Enable access</button>`
            : `<button class="outlineBtn dangerText" data-del-access="${esc(u.id)}" data-name="${esc(u.name)}">Disable access</button>`
        }</div>`
      : '';
  const reset =
    isSupervisor && uiRole() === 'admin'
      ? `<form id="resetPwForm" data-user="${esc(u.id)}" data-name="${esc(u.name)}" style="margin-top:18px"><h2 class="sectionTitle">Reset password</h2><p class="muted small">Set a new password for ${esc(u.name)}. They are signed out everywhere and must use the new one. Tell them the new password yourself.</p><div class="field"><label>New password</label><input name="password" type="password" minlength="8" maxlength="100" autocomplete="new-password" placeholder="At least 8 characters" required></div><button class="secondary">Set new password</button></form>`
      : '';
  return `<div class="card" style="padding:16px;margin:12px 0">${identity}${sites}${reset}${danger}</div>`;
}
function accessListPanel(d) {
  return `<div class="card" style="padding:16px;margin:12px 0">${d.access.map((u) => accessRow(u, d)).join('')}${uiRole() === 'admin' ? `<details class="addSupervisor"><summary>Add supervisor</summary><form id="accessForm" style="margin-top:14px"><div class="field"><label>User ID</label><input name="id" required></div><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" maxlength="100" autocomplete="new-password" placeholder="At least 8 characters" required></div><div class="field"><label>Locations</label>${siteChecklist(d, new Set())}</div><button class="secondary">Create supervisor</button></form></details>` : '<p class="muted small">Only admins can create or change access.</p>'}</div>`;
}
function settings() {
  const d = state.settings;
  const accessCount = d ? d.access.length : null;
  let panel = '';
  if (d && state.settingsView === 'profile')
    panel = `<div class="card" style="padding:16px;margin:12px 0"><form id="profileForm"><div class="field"><label>Name</label><input name="name" value="${esc(d.profile.name)}" required></div><div class="field"><label>User ID</label><input value="${esc(d.profile.id)}" disabled></div><button class="secondary">Save profile</button></form></div>`;
  if (d && state.settingsView === 'locations')
    panel = `<div class="card" style="padding:16px;margin:12px 0"><h2 class="sectionTitle" style="margin-top:0">Locations</h2>${d.locations.map((l) => `<div class="person ${l.active ? '' : 'disabledRow'}"><span><strong>${esc(l.name)} ${l.active ? '' : '<span class="badge grey">Disabled</span>'}</strong><small>${esc(l.area)} · ${empCountLabel(l)} · ${esc(shiftLabel(l))}</small></span></div>`).join('') || '<p class="muted small">No locations yet. Add the first branch below.</p>'}${uiRole() === 'admin' ? `<form id="locationForm" style="margin-top:14px"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Area</label><input name="area" required></div>${shiftFields()}${locationSupervisorField()}<button class="secondary" ${!Array.isArray(state.settings?.access) ? 'disabled' : ''}>Add location</button></form>` : '<p class="muted small">Supervisors can view assigned locations. Admins manage branches.</p>'}</div>`;
  if (d && state.settingsView === 'accessUser') {
    const au = uiRole() === 'admin' ? d.access.find((u) => u.id === state.accessUserId) : null;
    if (au) panel = accessDetail(au, d);
    else state.settingsView = 'access';
  }
  if (d && state.settingsView === 'access') panel = accessListPanel(d);
  if (d && state.settingsView === 'activity' && uiRole() === 'admin')
    panel = `<div class="card" style="padding:16px;margin:12px 0"><p class="muted small">Each recorded change, newest first. Time corrections always carry a reason.</p><p style="text-align:right;margin:0 0 8px"><button class="link" id="exportAudit">Export full log (CSV)</button></p>${(state.audit || []).map((a) => `<div class="person"><span><strong>${esc(auditTitle(a))}</strong><small>${esc(auditDetail(a))}</small><small>${esc(a.user_id)} · ${esc(fmtAuditTime(a.at))}</small></span></div>`).join('') || '<p class="muted small">No activity recorded yet.</p>'}</div>`;
  const items = [
    [
      'profile',
      'My profile',
      esc((d ? d.profile.name : state.user?.name) + ' · ' + (d ? d.profile.id : state.user?.id)),
    ],
    ['access', 'User access', 'View roles and location scope'],
  ];
  if (uiRole() === 'admin') items.push(['activity', 'Activity log', 'Each change and correction, with reasons']);
  if (state.settingsView && panel) {
    const title =
      state.settingsView === 'accessUser'
        ? d.access.find((u) => u.id === state.accessUserId)?.name || 'User'
        : { profile: 'My profile', access: 'User access', activity: 'Activity log' }[state.settingsView] || 'Settings';
    const backTo = state.settingsView === 'accessUser' ? 'access' : '';
    return `<div class="page">${header()}<button class="link backLink" data-settings="${backTo}">${backTo ? '‹ User access' : '‹ Settings'}</button><h1>${title}</h1>${panel}</div>${nav()}${message()}`;
  }
  return `<div class="page">${header()}<h1>Settings</h1><p class="sub">Manage your account and app preferences.</p>${items
    .map(
      ([k, t, sub]) =>
        `<button class="navLink" data-${k === 'locations' ? 'go' : 'settings'}="${k}"><span><strong>${t}</strong><small>${sub}</small></span><span class="badge ${state.settingsView === k ? 'green' : 'blue'}">${k === 'locations' ? (d ? d.locations.length : state.locations.length) : k === 'access' ? (d ? plural(accessCount, 'user') : '›') : '›'}</span></button>`,
    )
    .join(
      '',
    )}<button class="secondary" id="logout" style="margin-top:18px">Sign out</button></div>${nav()}${message()}`;
}
// Paint the current state into #app, then bind the events the new markup needs.
async function render() {
  let html = '';
  try {
    if (!state.token) html = location.hash === '#owner-setup' ? ownerSetupView() : login();
    else if (state.user?.role === 'owner' && !state.companyId) html = await ownerConsole();
    else if (state.screenError?.screen === state.screen) html = screenErrorView();
    else if (state.screen === 'locations') {
      if (state.showLocationForm && uiRole() === 'admin' && !state.settings)
        state.settings = await api('/api/settings');
      html = locations();
    } else if (state.screen === 'locationDetail') html = locationDetail();
    else if (state.screen === 'attendance') html = attendance();
    else if (state.screen === 'add') html = add();
    else if (state.screen === 'checkout') html = checkout();
    else if (state.screen === 'dashboard' || state.screen === 'home') html = await dashboard();
    else if (state.screen === 'menu') html = menu();
    else if (state.screen === 'employees') html = employees();
    else if (state.screen === 'reports') html = reports();
    else if (state.screen === 'settings') html = settings();
    else html = locations();
  } catch (e) {
    // A screen could not load its data (for example the Home dashboard): show the
    // shared error state for that screen. A 401 has already cleared the token.
    if (state.token) {
      state.screenError = { screen: state.screen, status: e.status || 0, message: e.message };
      html = screenErrorView();
    } else html = login();
  }
  // Keep the caret (and the mobile keyboard) where the user was typing: re-rendering
  // replaces the DOM, so restore focus and selection to the same field afterwards.
  const active = document.activeElement;
  const focusId = active && active.id ? active.id : '';
  const selStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const selEnd = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
  const searchPage =
    active?.classList.contains('search') && active.parentElement?.classList.contains('page')
      ? active.parentElement
      : null;
  const next = document.createElement('template');
  next.innerHTML = html + confirmModal();
  const nextPage = next.content.querySelector('.page');
  const nextInput = focusId ? nextPage?.querySelector('#' + focusId) : null;
  if (searchPage && nextInput?.parentElement === nextPage && !state.confirm) {
    // Replace results around the input, never the input itself. Native held-backspace,
    // word deletion and composition keep their original DOM target and selection.
    const before = [];
    const after = [];
    let past = false;
    for (const node of [...nextPage.childNodes]) {
      if (node === nextInput) {
        past = true;
        continue;
      }
      (past ? after : before).push(node);
    }
    for (const node of [...searchPage.childNodes]) if (node !== active) node.remove();
    for (const node of before) searchPage.insertBefore(node, active);
    for (const node of after) searchPage.append(node);
    for (const node of [...$app.childNodes]) if (node !== searchPage) node.remove();
    for (const node of [...next.content.childNodes]) if (node !== nextPage) $app.append(node);
  } else $app.innerHTML = html + confirmModal();
  bind();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (selStart !== null && typeof el.setSelectionRange === 'function')
        try {
          el.setSelectionRange(selStart, selEnd);
        } catch (err) {
          // Some input types (date, time) do not support selection ranges.
        }
    }
  }
}
// Wire up clicks/inputs on the freshly rendered markup. One branch per screen.
function bind() {
  bindOwner();
  document.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
  document.querySelectorAll('[data-filter]').forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.filter;
        loadAttendance().catch((e) => showScreenError(e, 'attendance'));
      }),
  );
  const lf = document.getElementById('loginForm');
  if (lf) lf.onsubmit = doLogin;
  document.querySelectorAll('[data-loc]').forEach((b) => (b.onclick = () => openLocationDetail(b.dataset.loc)));
  document.querySelectorAll('[data-use-loc]').forEach(
    (b) =>
      (b.onclick = async () => {
        state.location = state.locations.find((l) => l.id === b.dataset.useLoc);
        state.detail = null;
        go('attendance');
      }),
  );
  document
    .querySelectorAll('[data-del-emp]')
    .forEach((b) => (b.onclick = () => askDisableEmployee(b.dataset.delEmp, b.dataset.name)));
  document
    .querySelectorAll('[data-en-emp]')
    .forEach((b) => (b.onclick = () => setEmployeeActive(b.dataset.enEmp, true)));
  document
    .querySelectorAll('[data-del-loc]')
    .forEach((b) => (b.onclick = () => askDisableLocation(b.dataset.delLoc, b.dataset.name)));
  document
    .querySelectorAll('[data-en-loc]')
    .forEach((b) => (b.onclick = () => setLocationActive(b.dataset.enLoc, true)));
  document.querySelectorAll('[data-edittime]').forEach(
    (b) =>
      (b.onclick = () => {
        state.editTimes = state.attendance.find((r) => (r.id || r.employee_id) === b.dataset.edittime) || null;
        render();
        document.getElementById('timeEditCard')?.scrollIntoView({ behavior: 'smooth' });
      }),
  );
  const tef = document.getElementById('timeEditForm');
  if (tef) tef.onsubmit = saveTimeEdit;
  const cte = document.getElementById('cancelTimeEdit');
  if (cte)
    cte.onclick = () => {
      state.editTimes = null;
      render();
    };
  const addShift = document.getElementById('addShiftRow');
  if (addShift)
    addShift.onclick = () => {
      const rowsEl = document.getElementById('shiftRows');
      const count = rowsEl.querySelectorAll('[data-shift-row]').length;
      if (count < MAX_SHIFT_SLOTS) {
        rowsEl.insertAdjacentHTML('beforeend', shiftRowHtml({}, count + 1));
        renumberShiftRows(rowsEl.closest('form') || document);
        captureShiftDraft(rowsEl.closest('form'));
      }
    };
  const tse = document.getElementById('toggleShiftEdit');
  if (tse)
    tse.onclick = () => {
      state.shiftDraft = locationShifts(state.detail.location).map((r) => ({ ...r }));
      state.shiftError = '';
      render();
    };
  const cse = document.getElementById('cancelShiftEdit');
  if (cse)
    cse.onclick = () => {
      if (state.shiftSaving) return;
      state.shiftDraft = null;
      state.shiftError = '';
      render();
    };
  const sef = document.getElementById('shiftEditForm');
  if (sef) {
    sef.onsubmit = saveShifts;
    sef.oninput = () => captureShiftDraft(sef);
  }
  const cOk = document.getElementById('confirmOk');
  if (cOk)
    cOk.onclick = async () => {
      const action = state.confirm?.onOk;
      state.confirm = null;
      if (action) await action();
    };
  const cCancel = document.getElementById('confirmCancel');
  if (cCancel)
    cCancel.onclick = () => {
      state.confirm = null;
      render();
    };
  const cl = document.getElementById('continueLoc');
  if (cl) cl.onclick = () => go('attendance');
  const al = document.getElementById('attendanceLocation');
  if (al)
    al.onchange = async (e) => {
      state.location = state.locations.find((l) => l.id === e.target.value);
      state.lookupResults = null;
      state.addQuery = '';
      state.outQuery = '';
      state.query = '';
      state.filter = 'all';
      state.attendance = [];
      state.summary = {};
      render();
      try {
        await loadAttendance();
      } catch (err) {
        showScreenError(err, 'attendance');
      }
    };
  const as = document.getElementById('attSearch');
  if (as)
    as.oninput = (e) => {
      state.query = e.target.value;
      clearTimeout(window.q);
      window.q = setTimeout(() => loadAttendance().catch((e) => showScreenError(e, 'attendance')), 250);
    };
  const ls = document.getElementById('locSearch');
  if (ls)
    ls.oninput = (e) => {
      state.locationQuery = e.target.value;
      render();
    };
  const es = document.getElementById('empSearch');
  if (es)
    es.oninput = (e) => {
      state.employeeQuery = e.target.value;
      render();
    };
  const elf = document.getElementById('empLocFilter');
  if (elf)
    elf.onchange = (e) => {
      state.employeeLocation = e.target.value;
      render();
    };
  document.querySelectorAll('[data-locaction]').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.locaction === 'add') {
          openLocationForm();
        } else if (b.dataset.locaction === 'directory')
          document.getElementById('locationList')?.scrollIntoView({ behavior: 'smooth' });
        else document.getElementById('importLocationFile')?.click();
      }),
  );
  const lif = document.getElementById('importLocationFile');
  if (lif) lif.onchange = (e) => e.target.files[0] && importLocations(e.target.files[0]);
  const ads = document.getElementById('addSearch');
  if (ads)
    ads.oninput = (e) => {
      state.addQuery = e.target.value;
      render();
      scheduleEmployeeSearch('checkin');
    };
  const os = document.getElementById('outSearch');
  if (os)
    os.oninput = (e) => {
      state.outQuery = e.target.value;
      render();
      scheduleEmployeeSearch('checkout');
    };
  document.querySelectorAll('[data-checkin]').forEach((b) => (b.onclick = () => askCheckin(b.dataset.checkin)));
  document.querySelectorAll('[data-checkout]').forEach((b) => (b.onclick = () => askCheckout(b.dataset.checkout)));
  const tn = document.getElementById('toggleNew');
  if (tn)
    tn.onclick = () => {
      document.getElementById('newEmployee').style.display = 'block';
    };
  const ne = document.getElementById('newEmployee');
  if (ne) ne.onsubmit = doNewEmployee;
  const ea = document.getElementById('exportAudit');
  if (ea) ea.onclick = exportAudit;
  const fp = document.getElementById('forgot');
  if (fp) fp.onclick = () => toast('Demo: use the visible demo credentials. Production recovery needs an admin reset.');
  const imp = document.getElementById('importFile');
  if (imp) imp.onchange = (e) => e.target.files[0] && importEmployees(e.target.files[0]);
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = logout;
  document.querySelectorAll('[data-export]').forEach((b) => (b.onclick = () => exportMonth(b.dataset.export)));
  document.querySelectorAll('[data-emp]').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.emp === 'add') {
          state.showEmployeeForm = !state.showEmployeeForm;
          render();
        } else if (b.dataset.emp === 'directory')
          document.getElementById('directoryList')?.scrollIntoView({ behavior: 'smooth' });
        else document.getElementById('importFile')?.click();
      }),
  );
  const ovSel = document.getElementById('overviewLocation');
  if (ovSel)
    ovSel.onchange = () => {
      state.overviewLocation = ovSel.value;
      render();
    };
  document.querySelectorAll('[data-overview-loc]').forEach(
    (b) =>
      (b.onclick = () => {
        state.overviewLocation = b.dataset.overviewLoc;
        render();
      }),
  );
  document.querySelectorAll('[data-settings]').forEach((b) => (b.onclick = () => openSettings(b.dataset.settings)));
  const pf = document.getElementById('profileForm');
  if (pf) pf.onsubmit = saveProfile;
  const locf = document.getElementById('locationForm');
  if (locf) locf.onsubmit = createLocation;
  const supervisorChoice = document.getElementById('locationSupervisor');
  if (supervisorChoice)
    supervisorChoice.onchange = () => {
      document.getElementById('locationSupervisorSelection').textContent =
        supervisorChoice.value === '__unassigned__'
          ? 'No supervisor will receive access.'
          : supervisorChoice.selectedOptions[0].textContent;
    };
  const rpf = document.getElementById('resetPwForm');
  if (rpf)
    rpf.onsubmit = (e) => {
      e.preventDefault();
      const password = new FormData(rpf).get('password');
      const { user, name } = rpf.dataset;
      state.confirm = {
        title: 'Set a new password for ' + (name || user) + '?',
        lines: [
          { label: 'Account', value: user },
          { label: 'Effect', value: 'They are signed out everywhere and must sign in with the new password.' },
        ],
        okLabel: 'Set new password',
        danger: true,
        onOk: () => resetSupervisorPassword(user, name, password),
      };
      render();
    };
  const ef = document.getElementById('employeeForm');
  if (ef) ef.onsubmit = createEmployee;
  document.querySelectorAll('[data-open-access]').forEach(
    (b) =>
      (b.onclick = () => {
        state.accessUserId = b.dataset.openAccess;
        go('settings', { settingsView: 'accessUser' });
      }),
  );
  document
    .querySelectorAll('[data-del-access]')
    .forEach((b) => (b.onclick = () => askDisableAccess(b.dataset.delAccess, b.dataset.name)));
  document
    .querySelectorAll('[data-en-access]')
    .forEach((b) => (b.onclick = () => setAccessActive(b.dataset.enAccess, true)));
  const aef = document.getElementById('accessEditForm');
  if (aef) aef.onsubmit = saveAccessSites;
  const acf = document.getElementById('accessForm');
  if (acf) acf.onsubmit = createAccess;
  document.querySelectorAll('[data-screen-retry]').forEach(
    (b) =>
      (b.onclick = () => {
        const screen = state.screenError?.screen || state.screen;
        state.screenError = null;
        if (screen === 'settings') openSettings(state.settingsView || '');
        else go(screen, { replace: true });
      }),
  );
  // 403/404 on a location screen: reload the location list (the location may be
  // removed or no longer assigned), then let the user choose again.
  document.querySelectorAll('[data-screen-locations]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          await bootstrap();
        } catch (e) {
          if (e.status === 401) return;
          // Keep the old list when the reload fails; the Locations screen still opens.
        }
        go('locations');
      }),
  );
  bindReports();
}
// In-app history: hash changes (#attendance, #reports, ...) are kept in sync with
// an internal stack so the hardware/browser Back button walks back screen by screen
// instead of leaving the app.
const appScreens = [
  'locations',
  'locationDetail',
  'attendance',
  'add',
  'checkout',
  'dashboard',
  'menu',
  'employees',
  'reports',
  'settings',
];
function historyPayload() {
  return { gfScreen: state.screen, settingsView: state.settingsView || '' };
}
function currentHash() {
  return '#' + state.screen;
}
function pushCurrent(replace = false) {
  const payload = historyPayload();
  const current =
    history.state && !history.state.gfBase
      ? { gfScreen: history.state.gfScreen, settingsView: history.state.settingsView || '' }
      : null;
  if (replace) history.replaceState(payload, '', currentHash());
  else if (!current || JSON.stringify(current) !== JSON.stringify(payload) || location.hash !== currentHash())
    history.pushState(payload, '', currentHash());
}
function startHistory(screen) {
  history.replaceState({ gfBase: true }, '', '#guardian');
  history.pushState({ gfScreen: screen, settingsView: state.settingsView || '' }, '', '#' + screen);
}
function go(screen, opts = {}) {
  if (screen === 'settings' && opts.settingsView === undefined) opts.settingsView = '';
  state.confirm = null;
  state.error = '';
  state.lookupResults = null;
  state.notice = '';
  state.screenError = null;
  if (screen === 'home') screen = 'dashboard';
  if (screen === 'settings' && !state.settings) {
    openSettings(state.settingsView || '');
    return;
  }
  state.screen = screen;
  if (opts.settingsView !== undefined) state.settingsView = opts.settingsView;
  if (['add', 'checkout'].includes(screen) && !state.location) {
    state.screen = 'attendance';
    if (!opts.fromPop) pushCurrent();
    render();
    return;
  }
  if (!opts.fromPop) pushCurrent(opts.replace);
  if (['attendance', 'add', 'checkout'].includes(screen)) {
    loadAttendance()
      .then(render)
      .catch((e) => showScreenError(e, screen));
    return;
  }
  if (screen === 'employees') {
    loadEmployees().catch((e) => showScreenError(e, 'employees'));
    return;
  }
  if (screen === 'reports') {
    loadReport();
    return;
  }
  render();
}
window.addEventListener('popstate', (event) => {
  if (!state.token) {
    state.screen = 'login';
    render();
    return;
  }
  if (event.state?.gfBase) {
    history.pushState(historyPayload(), '', currentHash());
    render();
    return;
  }
  const target = event.state?.gfScreen || location.hash.slice(1);
  if (!appScreens.includes(target)) {
    history.pushState(historyPayload(), '', currentHash());
    render();
    return;
  }
  go(target, { fromPop: true, settingsView: event.state?.settingsView || '' });
});
// Login submit and the startup path (restore a saved session or show the form).
async function doLogin(e) {
  e.preventDefault();
  state.error = '';
  const creds = Object.fromEntries(new FormData(e.target));
  const finish = async (r) => {
    state.token = r.token;
    state.user = r.user;
    localStorage.setItem('gf_token', r.token);
    localStorage.setItem('gf_user', JSON.stringify(r.user));
    if (r.user.role === 'owner') {
      state.companyId = '';
      localStorage.removeItem('gf_company');
      state.screen = 'dashboard';
      startHistory(state.screen);
      render();
      return;
    }
    await bootstrap();
    state.notice = '';
    if (state.location) await loadAttendance();
    state.screen = 'dashboard';
    startHistory(state.screen);
    render();
  };
  try {
    await finish(await api('/api/login', { method: 'POST', body: JSON.stringify(creds) }));
    return;
  } catch (err) {
    state.error = err.message;
    render();
  }
}
async function bootstrap() {
  ++attendanceGeneration;
  state.locations = await api('/api/locations');
  // Attendance runs only on active locations; disabled ones stay visible elsewhere, greyed out.
  const usable = state.locations.filter((l) => l.active);
  state.location = usable.some((l) => l.id === state.location?.id) ? state.location : usable[0] || null;
  state.showLocationForm = !state.locations.length && uiRole() === 'admin';
  state.dashboard = null;
  state.report = null;
}
let attendanceGeneration = 0;
// Attendance data: today's records and the check-in/out actions.
async function loadAttendance() {
  const generation = ++attendanceGeneration;
  if (!state.location) return;
  const token = state.token;
  const locationId = state.location.id;
  const query = state.query;
  const filter = state.filter;
  const isCurrent = () =>
    generation === attendanceGeneration &&
    state.token === token &&
    state.location?.id === locationId &&
    state.query === query &&
    state.filter === filter;
  const q = new URLSearchParams({ location_id: state.location.id, day: todayISO() });
  if (state.query) q.set('q', state.query);
  if (state.filter !== 'all') q.set('status', state.filter);
  try {
    const r = await api('/api/attendance?' + q);
    if (!isCurrent()) return;
    state.attendance = r.rows;
    state.summary = r.summary;
    state.staleOpen = r.stale_open || [];
    render();
  } catch (err) {
    if (isCurrent()) throw err;
  }
}
async function loadEmployees(renderNow = true) {
  state.employees = await api('/api/employees');
  if (renderNow) render();
}
// Live name/EMP-ID search behind the single box on the marking screens: the same
// supervisor-session lookup the old Find form used (minimal fields, ad hoc included).
let employeeSearchGeneration = 0;
function scheduleEmployeeSearch(kind) {
  clearTimeout(window.employeeSearch);
  window.employeeSearch = setTimeout(() => runEmployeeSearch(kind), 300);
}
async function runEmployeeSearch(kind) {
  const q = (kind === 'checkin' ? state.addQuery : state.outQuery).trim();
  const generation = ++employeeSearchGeneration;
  if (!q) {
    state.lookupResults = null;
    return render();
  }
  try {
    const r = await api('/api/employee-lookup?employee_id=' + encodeURIComponent(q));
    if (generation !== employeeSearchGeneration || q !== (kind === 'checkin' ? state.addQuery : state.outQuery).trim())
      return;
    state.lookupResults = r.matches || [r];
  } catch (err) {
    if (generation !== employeeSearchGeneration || q !== (kind === 'checkin' ? state.addQuery : state.outQuery).trim())
      return;
    if (err.status === 404) state.lookupResults = [];
    else return toast(err.message);
  }
  render();
}
// Check-in asks first, like check-out: the dialog shows the IST check-in time and
// the location the shift starts at, so ad-hoc starts stay explicit.
function askCheckin(id) {
  const row = state.attendance.find((r) => r.employee_id === id);
  const match = (state.lookupResults || []).find((x) => x.id === id);
  const emp = row
    ? { employee_id: row.employee_id, name: row.name, adhoc: !!row.adhoc }
    : match
      ? { employee_id: match.id, name: match.name, adhoc: match.location_id !== state.location.id }
      : null;
  if (!emp) return;
  state.confirm = {
    title: 'Confirm check-in',
    lines: [
      { label: 'Employee', value: emp.name + ' (' + emp.employee_id + ')' },
      { label: 'Check-in time', value: nowTime() + ' IST' },
      { label: 'Location', value: state.location.name + (emp.adhoc ? ' · ad-hoc shift' : '') },
    ],
    okLabel: 'Yes, check in',
    onOk: () => doCheckin(emp),
  };
  render();
}
async function doCheckin(emp, confirmedSecondShift = false) {
  if (state.checkingIn) return;
  state.checkingIn = true;
  try {
    const result = await api('/api/attendance/checkin', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: emp.employee_id,
        location_id: state.location.id,
        confirm_second_shift: confirmedSecondShift,
      }),
    });
    if (result.requires_confirmation) {
      state.confirm = {
        title: 'Second shift today',
        lines: [
          { label: 'Employee', value: emp.name },
          { label: 'Previous shifts checked out today', value: String(result.prior_shifts) },
          { label: 'New location', value: state.location.name },
        ],
        okLabel: 'Check in',
        onOk: () => doCheckin(emp, true),
      };
      return;
    }
    state.dashboard = null;
    await loadAttendance();
    state.screen = 'add';
    toast('Check-in recorded');
  } catch (e) {
    if (e.status === 403 || e.status === 404) return showScreenError(e, 'attendance');
    state.error = e.message;
    render();
  } finally {
    state.checkingIn = false;
    render();
  }
}
// Check-out always asks first, showing the IST check-out time and hours worked.
function askCheckout(id) {
  // Show the record the backend closes: the newest open check-in (check_out orders
  // open days DESC). A real checked-in row from today wins; only then the newest stale
  // open record. The today's-list row for an overnight worker is a LEFT JOIN shell
  // with check_in NULL - picking it made the dialog show 0h 00m.
  const todayOpen = state.attendance.find((r) => r.employee_id === id && r.status === 'checked_in' && r.check_in);
  const staleOpen = (state.staleOpen || [])
    .filter((r) => r.employee_id === id && r.check_in)
    .sort((a, b) => (a.day < b.day ? 1 : -1));
  const row = todayOpen || staleOpen[0];
  if (!row) return;
  const nowMs = Date.now();
  const inMs = row.check_in ? new Date(row.check_in).getTime() : nowMs;
  const mins = Math.max(0, Math.round((nowMs - inMs) / 60000));
  const hoursText = Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm';
  state.confirm = {
    title: 'Are you sure you want to check out?',
    lines: [
      { label: 'Employee', value: row.name + ' (' + row.employee_id + ')' },
      { label: 'Check-out time', value: nowTime() + ' IST' },
      { label: 'Hours worked', value: hoursText },
    ],
    okLabel: 'Yes, check out',
    onOk: () => doCheckout(id),
  };
  render();
}
async function doCheckout(id) {
  state.confirm = null;
  try {
    await api('/api/attendance/checkout', {
      method: 'POST',
      body: JSON.stringify({ employee_id: id, location_id: state.location.id }),
    });
    state.dashboard = null;
    await loadAttendance();
    state.screen = 'checkout';
    toast('Check-out recorded');
  } catch (e) {
    if (e.status === 403 || e.status === 404) return showScreenError(e, 'attendance');
    state.error = e.message;
    render();
  }
}
// Employee creation from the Add screen.
async function doNewEmployee(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    const r = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ ...f, location_id: state.location.id }),
    });
    state.employees = [];
    state.locations = await api('/api/locations');
    state.dashboard = null;
    await loadAttendance();
    toast(r.warning || 'Employee added');
  } catch (err) {
    state.error = err.message;
    render();
  }
}
async function createEmployee(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    // Location is optional at creation; an empty choice means "assign later".
    const r = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ ...f, role: 'Guard', location_id: f.location_id || null }),
    });
    state.locations = await api('/api/locations');
    state.dashboard = null;
    await loadEmployees(false);
    state.showEmployeeForm = false;
    toast(r.warning || 'Employee added');
  } catch (err) {
    state.error = err.message;
    render();
  }
}
// Reports: data loading for the open tab, plus the Excel export of what is on screen.
async function loadReport() {
  const r = state.report || (state.report = reportDefaults());
  const seq = ++r.seq;
  r.loading = true;
  r.error = '';
  r.errorStatus = 0;
  render();
  try {
    let data = null;
    if (r.tab === 'day') {
      if (r.dayLocation)
        data = await api(
          '/api/reports/monthly?' +
            new URLSearchParams({ month: r.date.slice(0, 7), day: r.date, location_id: r.dayLocation }),
        );
    } else if (r.tab === 'month') {
      const q = new URLSearchParams({ month: r.month });
      const loc = r.detail || r.monthLocation;
      if (loc) q.set('location_id', loc);
      data = await api('/api/reports/summary?' + q);
    } else data = await api('/api/reports/months?months=6');
    if (seq !== r.seq || state.report !== r) return;
    if (r.tab === 'day') r.day = data || { rows: [] };
    else if (r.tab === 'month' && r.detail) r.detailData = data;
    else if (r.tab === 'month') r.summary = data;
    else r.history = data;
    r.loadedAt = fmtTime(new Date().toISOString());
  } catch (e) {
    if (seq !== r.seq || state.report !== r) return;
    r.error = e.message;
    r.errorStatus = e.status || 0;
  }
  r.loading = false;
  render();
}
function exportCurrentReport() {
  const r = state.report;
  if (!r) return;
  if (r.tab === 'day') return exportReport(r.date.slice(0, 7), r.date, r.dayLocation);
  return exportReport(r.month, '', r.detail || r.monthLocation);
}
function bindReports() {
  const r = state.report;
  if (!r || state.screen !== 'reports') return;
  document.querySelectorAll('[data-rtab]').forEach(
    (b) =>
      (b.onclick = () => {
        if (r.tab === b.dataset.rtab && !r.detail) return;
        r.tab = b.dataset.rtab;
        r.detail = '';
        r.sheet = false;
        loadReport();
      }),
  );
  document.querySelectorAll('[data-rstatus]').forEach(
    (b) =>
      (b.onclick = () => {
        r.status = b.dataset.rstatus;
        render();
      }),
  );
  const periodInput = document.getElementById('reportPeriod');
  if (periodInput) {
    // Phones open their picker on the tap itself. With a mouse, a click on the text of a
    // date input only selects a part of the date, so open the picker as well.
    periodInput.onclick = () => {
      if (!window.matchMedia('(pointer: fine)').matches) return;
      try {
        periodInput.showPicker();
      } catch {
        // The picker is already open, or this browser has no showPicker(): the input still works.
      }
    };
    periodInput.onchange = () => {
      if (!periodInput.value) return;
      if (r.tab === 'day') {
        r.date = periodInput.value;
        r.status = 'all';
      } else r.month = periodInput.value;
      loadReport();
    };
  }
  const locationButton = document.getElementById('reportLocation');
  if (locationButton)
    locationButton.onclick = () => {
      r.sheet = true;
      render();
    };
  document.querySelectorAll('[data-rsheet-close]').forEach(
    (b) =>
      (b.onclick = () => {
        r.sheet = false;
        render();
      }),
  );
  document.querySelectorAll('[data-rloc]').forEach(
    (b) =>
      (b.onclick = () => {
        r.sheet = false;
        if (r.tab === 'day') {
          r.dayLocation = b.dataset.rloc;
          r.status = 'all';
        } else r.monthLocation = b.dataset.rloc;
        loadReport();
      }),
  );
  if (r.sheet) document.querySelector('.rpSheet .rpOption.active, .rpSheet .rpOption')?.focus();
  document.querySelectorAll('[data-rdetail]').forEach(
    (b) =>
      (b.onclick = () => {
        r.detail = b.dataset.rdetail;
        r.detailData = null;
        loadReport();
      }),
  );
  document.querySelectorAll('[data-rback]').forEach(
    (b) =>
      (b.onclick = () => {
        r.detail = '';
        if (r.summary) render();
        else loadReport();
      }),
  );
  document.querySelectorAll('[data-rday]').forEach(
    (b) =>
      (b.onclick = () => {
        r.tab = 'day';
        r.dayLocation = r.detail;
        r.detail = '';
        r.date = b.dataset.rday;
        r.status = 'all';
        loadReport();
      }),
  );
  document.querySelectorAll('[data-rtoday]').forEach(
    (b) =>
      (b.onclick = () => {
        const today = todayISO();
        if (r.tab === 'day') r.date = today;
        else r.month = today.slice(0, 7);
        loadReport();
      }),
  );
  document.querySelectorAll('[data-rretry]').forEach((b) => (b.onclick = () => loadReport()));
  // 403/404: refresh the location list (a location may be removed), then let the user pick again.
  document.querySelectorAll('[data-rchoose]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          state.locations = await api('/api/locations');
        } catch (e) {
          // Keep the old list when the refresh fails; the sheet still opens.
          if (e.status === 401) return;
        }
        r.detail = '';
        r.sheet = true;
        render();
      }),
  );
  const exportButton = document.getElementById('reportExport');
  if (exportButton) exportButton.onclick = exportCurrentReport;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.screen === 'reports' && state.report?.sheet) {
    state.report.sheet = false;
    render();
  }
});
// Settings screens: profile, locations, and supervisor access.
async function openSettings(kind) {
  try {
    state.settings = await api('/api/settings');
    if (kind === 'activity' && uiRole() === 'admin') state.audit = (await api('/api/audit')).rows;
    go('settings', { settingsView: kind });
  } catch (e) {
    state.settingsView = kind;
    showScreenError(e, 'settings');
  }
}
async function saveProfile(e) {
  e.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(e.target));
    const r = await api('/api/settings/profile', { method: 'PATCH', body: JSON.stringify(body) });
    state.user = { ...state.user, name: r.name };
    localStorage.setItem('gf_user', JSON.stringify(state.user));
    state.settings = await api('/api/settings');
    toast('Profile saved');
  } catch (e) {
    state.error = e.message;
    render();
  }
}
// Location (branch) creation and CSV import - admin only.
async function openLocationForm() {
  if (state.showLocationForm) {
    state.showLocationForm = false;
    render();
    return;
  }
  try {
    state.settings = await api('/api/settings');
    state.error = '';
    state.showLocationForm = true;
    render();
  } catch (err) {
    state.error = 'Could not load supervisors. ' + err.message;
    render();
  }
}
async function createLocation(e) {
  e.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(e.target));
    if (!body.supervisor_id) throw new Error('Choose a supervisor or leave unassigned.');
    body.supervisor_id = body.supervisor_id === '__unassigned__' ? null : body.supervisor_id;
    body.shifts = collectShiftRows(e.target);
    delete body.shift_label;
    delete body.shift_start;
    delete body.shift_end;
    body.id = newLocationId(body.name);
    await api('/api/settings/locations', {
      method: 'POST',
      body: JSON.stringify({ ...body, assigned_count: 0 }),
    });
    state.locations = await api('/api/locations');
    state.location = state.locations.find((l) => l.id === body.id) || state.location;
    state.showLocationForm = false;
    state.dashboard = null;
    state.settings = await api('/api/settings');
    toast(
      'Location added as ' +
        body.id +
        (body.supervisor_id ? ' and assigned to ' + body.supervisor_id : ' (unassigned)'),
    );
  } catch (e) {
    state.error = e.message;
    render();
  }
}
// Admin edit of a branch's shift timings from the location detail page.
function captureShiftDraft(form) {
  if (form?.id !== 'shiftEditForm') return;
  state.shiftDraft = [...form.querySelectorAll('[data-shift-row]')].map((row) => ({
    label: row.querySelector('[name=shift_label]').value,
    shift_start: row.querySelector('[name=shift_start]').value,
    shift_end: row.querySelector('[name=shift_end]').value,
  }));
}
async function saveShifts(e) {
  e.preventDefault();
  const l = state.detail?.location;
  if (!l || state.shiftSaving) return;
  captureShiftDraft(e.target);
  let shifts;
  try {
    shifts = collectShiftRows(e.target);
  } catch (err) {
    state.shiftError = err.message;
    return render();
  }
  state.shiftSaving = true;
  state.shiftError = '';
  render();
  try {
    await api('/api/settings/locations/' + encodeURIComponent(l.id) + '/shifts', {
      method: 'PUT',
      body: JSON.stringify({ shifts }),
    });
    // Update from the accepted payload. A second read must not turn a successful save into an error.
    const updated = {
      ...l,
      shifts,
      shift_start: shifts[0]?.shift_start || null,
      shift_end: shifts[0]?.shift_end || null,
    };
    state.locations = state.locations.map((x) => (x.id === l.id ? updated : x));
    if (state.location?.id === l.id) state.location = updated;
    if (state.detail?.location.id === l.id) state.detail = { ...state.detail, location: updated };
    state.settings = null;
    if (state.detail?.location.id === l.id) state.shiftDraft = null;
    toast('Shifts saved');
  } catch (err) {
    if (state.token && state.detail?.location.id === l.id) state.shiftError = err.message;
  } finally {
    state.shiftSaving = false;
    render();
  }
}
// Location detail: shift timing plus the assigned employees, for both roles.
async function openLocationDetail(id) {
  const loc = state.locations.find((l) => l.id === id);
  if (!loc) return;
  state.shiftDraft = null;
  state.shiftError = '';
  state.detail = { location: loc, employees: null };
  go('locationDetail');
  try {
    const employees = await api('/api/employees?location_id=' + encodeURIComponent(id));
    if (state.detail?.location.id !== id) return;
    state.detail = { location: state.detail.location, employees };
    render();
  } catch (e) {
    state.error = e.message;
    render();
  }
}
// Admin corrections: save edited IST check-in/check-out times for an existing record.
async function saveTimeEdit(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    await api('/api/attendance/times', {
      method: 'PATCH',
      body: JSON.stringify({
        record_id: state.editTimes.id,
        employee_id: state.editTimes.employee_id,
        location_id: state.location.id,
        day: f.day,
        check_in: f.check_in,
        check_out: f.check_out || null,
        check_out_day: f.check_out ? f.check_out_day || null : null,
        reason: f.reason,
      }),
    });
    state.editTimes = null;
    state.dashboard = null;
    await loadAttendance();
    toast('Times updated');
  } catch (err) {
    state.error = err.message;
    render();
  }
}
// Admin removals. Records are retired, never erased, so attendance history is kept.
function askDisableEmployee(id, name) {
  state.confirm = {
    title: 'Disable ' + (name || id) + '?',
    lines: [
      { label: 'Employee', value: id },
      { label: 'Note', value: 'They stay in the list, greyed out. New attendance stops. History is kept.' },
    ],
    okLabel: 'Disable employee',
    danger: true,
    onOk: () => setEmployeeActive(id, false),
  };
  render();
}
async function setEmployeeActive(id, active) {
  try {
    await api('/api/employees/' + encodeURIComponent(id) + (active ? '/enable' : ''), {
      method: active ? 'POST' : 'DELETE',
    });
    state.locations = await api('/api/locations');
    state.dashboard = null;
    if (state.detail?.location) {
      state.detail = {
        location: state.locations.find((l) => l.id === state.detail.location.id) || state.detail.location,
        employees: await api('/api/employees?location_id=' + encodeURIComponent(state.detail.location.id)),
      };
    }
    await loadEmployees(false);
    await loadAttendance();
    toast(active ? 'Employee enabled' : 'Employee disabled');
  } catch (err) {
    state.error = err.message;
  }
  render();
}
function askDisableLocation(id, name) {
  state.confirm = {
    title: 'Disable ' + (name || id) + '?',
    lines: [
      { label: 'Location', value: id },
      {
        label: 'Note',
        value: 'It stays in the list, greyed out. Supervisors keep seeing it. History is kept.',
      },
    ],
    okLabel: 'Disable location',
    danger: true,
    onOk: () => setLocationActive(id, false),
  };
  render();
}
async function setLocationActive(id, active) {
  try {
    await api('/api/settings/locations/' + encodeURIComponent(id) + (active ? '/enable' : ''), {
      method: active ? 'POST' : 'DELETE',
    });
    await bootstrap();
    state.detail = null;
    state.settings = await api('/api/settings');
    go('locations');
    toast(active ? 'Location enabled' : 'Location disabled');
  } catch (err) {
    state.error = err.message;
    render();
  }
}
async function importLocations(file) {
  try {
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length < 2) throw new Error('CSV needs a header and at least one row');
    const headers = parsed[0].map((x) => x.trim());
    const rows = parsed.slice(1).map((cells) => {
      const row = Object.fromEntries(headers.map((h, i) => [h, (cells[i] || '').trim()]));
      return {
        id: row.id || null,
        name: row.name,
        area: row.area,
        assigned_count: Number(row.assigned_count || 0),
      };
    });
    const r = await api('/api/settings/locations/import', { method: 'POST', body: JSON.stringify({ rows }) });
    state.locations = await api('/api/locations');
    state.location = state.location || state.locations[0];
    state.settings = await api('/api/settings');
    toast('Imported ' + r.created + ' new and updated ' + r.updated + ' locations');
  } catch (e) {
    state.error = e.message;
    render();
  }
}
// Grant or update a supervisor's access to an assigned location.
async function createAccess(e) {
  e.preventDefault();
  try {
    const f = new FormData(e.target);
    const body = {
      id: f.get('id'),
      name: f.get('name'),
      password: f.get('password'),
      role: 'supervisor',
      location_ids: f.getAll('location_ids'),
    };
    await api('/api/settings/access', { method: 'POST', body: JSON.stringify(body) });
    state.settings = await api('/api/settings');
    toast('Supervisor access created');
  } catch (e) {
    state.error = e.message;
    render();
  }
}
function unsupervisedNote(r) {
  if (!r || !Array.isArray(r.unsupervised) || !r.unsupervised.length) return '';
  const names = r.unsupervised.map((id) => siteName(state.settings || {}, id));
  return ' - no active supervisor left at ' + names.join(', ');
}
// Replace a supervisor's site coverage; grants are enforced live by the server.
async function saveAccessSites(e) {
  e.preventDefault();
  const userId = e.target.dataset.user;
  try {
    const f = new FormData(e.target);
    const r = await api('/api/settings/access/' + encodeURIComponent(userId) + '/locations', {
      method: 'PATCH',
      body: JSON.stringify({ location_ids: f.getAll('location_ids') }),
    });
    state.settings = await api('/api/settings');
    toast('Locations updated' + unsupervisedNote(r));
  } catch (err) {
    state.error = err.message;
    render();
  }
}
function askDisableAccess(id, name) {
  state.confirm = {
    title: 'Disable ' + (name || id) + '?',
    lines: [
      { label: 'Supervisor', value: id },
      {
        label: 'Note',
        value:
          'This will sign them out immediately and block sign-in. Their sites, attendance history and activity log stay. Enable restores their site access.',
      },
    ],
    okLabel: 'Disable access',
    danger: true,
    onOk: () => setAccessActive(id, false),
  };
  render();
}
async function resetSupervisorPassword(id, name, password) {
  try {
    await api('/api/settings/access/' + encodeURIComponent(id) + '/password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    toast('Password changed for ' + (name || id) + '. They have been signed out.');
  } catch (err) {
    state.error = err.message;
    render();
  }
}
async function setAccessActive(id, active) {
  try {
    const r = await api('/api/settings/access/' + encodeURIComponent(id) + (active ? '/enable' : ''), {
      method: active ? 'POST' : 'DELETE',
    });
    state.settings = await api('/api/settings');
    toast((active ? 'Access enabled' : 'Access disabled') + unsupervisedNote(r));
  } catch (err) {
    state.error = err.message;
    render();
  }
}
// Excel exports: monthly summaries and filtered daily/location reports.
// The server streams a file; we hand the response to the browser as a download.
async function exportAudit() {
  const r = await fetch(API + '/api/audit/export', { headers: { Authorization: 'Bearer ' + state.token } });
  if (!r.ok) return toast('Could not export the activity log');
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'guardian-activity-log.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
async function exportMonth(month) {
  return exportReport(month);
}
async function exportReport(month, day = '', location = '') {
  try {
    const q = new URLSearchParams({ month });
    if (day) q.set('day', day);
    if (location) q.set('location_id', location);
    const r = await fetch(API + '/api/reports/export.xlsx?' + q, {
      headers: { Authorization: 'Bearer ' + state.token },
    });
    if (r.status === 401) {
      endSession();
      return;
    }
    if (!r.ok) {
      let message = 'Excel export failed';
      try {
        message = (await r.json()).detail || message;
      } catch {}
      throw new Error(message);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guardian-attendance-' + (day || month) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Excel file is ready · ' + a.download);
  } catch (e) {
    state.error = e.message;
    render();
  }
}

// Minimal CSV parser for the bulk employee/location imports.
function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = '',
    inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
async function importEmployees(file) {
  try {
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length < 2) throw new Error('CSV needs a header and at least one row');
    const headers = parsed[0].map((x) => x.trim());
    const rows = parsed.slice(1).map((cells) => {
      const row = Object.fromEntries(headers.map((h, i) => [h, (cells[i] || '').trim()]));
      return {
        id: row.id || null,
        name: row.name,
        phone: row.phone,
        role: row.role || 'Guard',
        location_id: row.location_id || state.location?.id,
      };
    });
    const r = await api('/api/employees/import', { method: 'POST', body: JSON.stringify({ rows }) });
    state.employees = [];
    state.locations = await api('/api/locations');
    state.dashboard = null;
    await loadEmployees(false);
    if (r.warnings && r.warnings.length) state.error = 'Imported, but check these duplicates: ' + r.warnings.join(' ');
    toast('Imported ' + r.created + ' new and updated ' + r.updated + ' employees');
    if (state.error) render();
  } catch (e) {
    state.error = e.message;
    render();
  }
}
// Sign out: clear the server session and the local copy, back to the login screen.
async function logout() {
  ++attendanceGeneration;
  try {
    if (state.token) await api('/api/logout', { method: 'POST', body: '{}' });
  } catch (netErr) {}
  localStorage.removeItem('gf_token');
  localStorage.removeItem('gf_user');
  localStorage.removeItem('gf_company');
  state.token = '';
  state.user = null;
  // Every per-account object is dropped, so a different role signing in on this tab
  // starts from a clean slate.
  clearSessionState();
  state.screen = 'login';
  history.replaceState({ gfScreen: 'login' }, '', '#login');
  render();
}

// Owner console: plain screens for companies and their admins. Only the owner reaches these.
async function ownerConsole() {
  if (!state.ownerData) {
    const companies = (await api('/api/owner/companies')).companies;
    const admins = {};
    for (const c of companies)
      admins[c.id] = (await api('/api/owner/companies/' + encodeURIComponent(c.id) + '/admins')).admins;
    state.ownerData = { companies, admins };
  }
  const { companies, admins } = state.ownerData;
  const card = (c) => {
    const list = admins[c.id] || [];
    const rows =
      list
        .map(
          (a) =>
            `<div class="person ${a.active ? '' : 'disabledRow'}"><span><strong>${esc(a.name)} ${a.active ? '' : '<span class="badge grey">Switched off</span>'}</strong><small>Login ID: ${esc(a.id)}</small></span><button class="selectBtn" data-owner-admin="${esc(a.id)}" data-active="${a.active ? 0 : 1}">${a.active ? 'Switch off' : 'Switch on'}</button></div>`,
        )
        .join('') || '<p class="muted small">No company admin yet. Add one below.</p>';
    return `<div class="card" style="padding:16px;margin:12px 0"><h2 class="sectionTitle" style="margin-top:0">${esc(c.name)} ${c.active ? '' : '<span class="badge grey">Paused</span>'}</h2><p class="muted small">${c.locations} locations · ${c.admins} admins · ${c.supervisors} supervisors</p>${rows}<details class="addSupervisor"><summary>Company details</summary><form data-owner-company-edit="${esc(c.id)}" style="margin-top:14px"><div class="field"><label>Company name</label><input name="name" required minlength="2" value="${esc(c.name)}"></div><div class="field"><label>Address (optional)</label><input name="address" maxlength="200" value="${esc(c.address || '')}"></div><div class="field"><label>Contact person (optional)</label><input name="contact_person" maxlength="100" value="${esc(c.contact_person || '')}"></div><div class="field"><label>Contact phone (optional)</label><input name="contact_phone" maxlength="30" value="${esc(c.contact_phone || '')}"></div><button class="secondary">Save details</button></form></details><details class="addSupervisor"><summary>Add a company admin</summary><form data-owner-admin-form="${esc(c.id)}" style="margin-top:14px"><div class="field"><label>Login ID</label><input name="id" required></div><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" maxlength="100" autocomplete="new-password" placeholder="At least 8 characters" required></div><button class="secondary">Create admin</button></form></details><div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">${c.active ? `<button class="primary" data-owner-open="${esc(c.id)}">Open this company</button>` : ''}<button class="secondary" data-owner-toggle="${esc(c.id)}" data-active="${c.active ? 0 : 1}">${c.active ? 'Pause company' : 'Resume company'}</button></div></div>`;
  };
  return `<div class="page noNav">${header()}<h1>Your companies</h1><p class="sub">Pick a company to manage it. Nothing from other companies is shown while you work in one.</p>${state.error ? `<div class="error" role="alert">${esc(state.error)}</div>` : ''}${companies.map(card).join('') || '<p class="muted small">No companies yet.</p>'}<div class="card addCard"><strong>Add a new company</strong><form id="ownerCompanyForm" style="margin-top:12px"><div class="field"><label>Company name</label><input name="name" required minlength="2"></div><button class="secondary">Add company</button></form></div><button class="secondary" id="logout" style="margin-top:18px">Sign out</button></div>${message()}`;
}
async function ownerAction(fn) {
  state.error = '';
  try {
    await fn();
    state.ownerData = null;
  } catch (err) {
    state.error = err.message;
  }
  render();
}
async function openCompany(id) {
  const c = state.ownerData.companies.find((x) => x.id === id);
  state.companyId = id;
  state.companyName = c ? c.name : '';
  localStorage.setItem('gf_company', id);
  clearOwnerScreens();
  try {
    await bootstrap();
    state.screen = 'dashboard';
    startHistory(state.screen);
  } catch (err) {
    state.companyId = '';
    localStorage.removeItem('gf_company');
    state.error = err.message;
  }
  render();
}
function clearOwnerScreens() {
  ++attendanceGeneration;
  const keep = { token: state.token, user: state.user, companyId: state.companyId, companyName: state.companyName };
  clearSessionState();
  Object.assign(state, keep);
}
function switchCompany() {
  state.companyId = '';
  state.companyName = '';
  localStorage.removeItem('gf_company');
  clearOwnerScreens();
  state.ownerData = null;
  state.screen = 'dashboard';
  render();
}

// One-time owner setup page (#owner-setup). The server only accepts it with the host's setup code,
// and only while no owner exists. The password is typed or filled here, never sent in chat.
function ownerSetupView() {
  return `<div class="page noNav login"><div class="logo">G</div><h1>Owner setup</h1><p class="sub">One-time step. You need the setup code from the host.</p>${state.error ? `<div class="error" role="alert">${esc(state.error)}</div>` : ''}${state.notice ? `<div class="toast">${esc(state.notice)}</div>` : ''}<form id="ownerSetupForm"><div class="field"><label>Setup code</label><input name="token" type="password" autocomplete="off" required minlength="8"></div><div class="field"><label>Your login ID</label><input name="id" autocomplete="username" required minlength="3"></div><div class="field"><label>Your name</label><input name="name" required minlength="2"></div><div class="field"><label>New password</label><input name="password" type="password" autocomplete="new-password" required minlength="10" placeholder="At least 10 characters"></div><button class="primary">Create owner account</button></form><p style="text-align:center;margin-top:16px"><button class="link" id="ownerSetupBack">Back to sign in</button></p></div>`;
}
function bindOwnerSetup() {
  const f = document.getElementById('ownerSetupForm');
  if (f)
    f.onsubmit = async (e) => {
      e.preventDefault();
      state.error = '';
      try {
        await api('/api/owner/setup', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(f))) });
        history.replaceState({ gfScreen: 'login' }, '', '#login');
        state.notice = 'Owner account created. Sign in with your new login.';
      } catch (err) {
        state.error = err.status === 403 ? 'That setup code was not accepted.' : err.message;
      }
      render();
    };
  const b = document.getElementById('ownerSetupBack');
  if (b)
    b.onclick = () => {
      history.replaceState({ gfScreen: 'login' }, '', '#login');
      render();
    };
}
function bindOwner() {
  bindOwnerSetup();
  const sw = document.getElementById('ownerSwitch');
  if (sw) sw.onclick = switchCompany;
  document.querySelectorAll('[data-owner-company-edit]').forEach((f) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      ownerAction(() =>
        api('/api/owner/companies/' + encodeURIComponent(f.dataset.ownerCompanyEdit), {
          method: 'PATCH',
          body: JSON.stringify(Object.fromEntries(new FormData(f))),
        }),
      );
    };
  });
  const cf = document.getElementById('ownerCompanyForm');
  if (cf)
    cf.onsubmit = (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(cf));
      ownerAction(() => api('/api/owner/companies', { method: 'POST', body: JSON.stringify(body) }));
    };
  document.querySelectorAll('[data-owner-admin-form]').forEach((f) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      ownerAction(() =>
        api('/api/owner/companies/' + encodeURIComponent(f.dataset.ownerAdminForm) + '/admins', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    };
  });
  document.querySelectorAll('[data-owner-admin]').forEach((b) => {
    b.onclick = () =>
      ownerAction(() =>
        api(
          '/api/owner/admins/' +
            encodeURIComponent(b.dataset.ownerAdmin) +
            (b.dataset.active === '1' ? '/enable' : '/disable'),
          {
            method: 'POST',
            body: '{}',
          },
        ),
      );
  });
  document.querySelectorAll('[data-owner-toggle]').forEach((b) => {
    b.onclick = () =>
      ownerAction(() =>
        api(
          '/api/owner/companies/' +
            encodeURIComponent(b.dataset.ownerToggle) +
            (b.dataset.active === '1' ? '/enable' : '/disable'),
          {
            method: 'POST',
            body: '{}',
          },
        ),
      );
  });
  document.querySelectorAll('[data-owner-open]').forEach((b) => (b.onclick = () => openCompany(b.dataset.ownerOpen)));
}
(async () => {
  if (state.token) {
    try {
      if (state.user?.role === 'owner') {
        if (state.companyId) {
          const list = (await api('/api/owner/companies')).companies;
          const hit = list.find((c) => c.id === state.companyId && c.active);
          if (hit) state.companyName = hit.name;
          else {
            state.companyId = '';
            localStorage.removeItem('gf_company');
          }
        }
      }
      if (state.user?.role !== 'owner' || state.companyId) await bootstrap();
      const requested = location.hash.slice(1);
      state.screen = appScreens.includes(requested) ? requested : 'dashboard';
      if (state.screen === 'attendance' && state.location) await loadAttendance();
      startHistory(state.screen);
    } catch {
      localStorage.removeItem('gf_token');
      state.token = '';
      state.screen = 'login';
      history.replaceState({ gfScreen: 'login' }, '', '#login');
    }
  } else if (location.hash !== '#owner-setup') history.replaceState({ gfScreen: 'login' }, '', '#login');
  render();
})();
