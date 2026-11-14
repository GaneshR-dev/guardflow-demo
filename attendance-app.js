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
const todayISO = () => dayISO(new Date());
const fmtDate = (d) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
const fmtMonth = (d) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d);
const fmtTime = (v) =>
  v ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(v)) : '-';
const initials = (n) =>
  n
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
const plural = (n, one, many = one + 's') => (n === 1 ? `${n} ${one}` : `${n} ${many}`);
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
const state = {
  token: localStorage.getItem('gf_token') || '',
  user: JSON.parse(localStorage.getItem('gf_user') || 'null'),
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
  showLocationForm: false,
  selected: null,
  lastCheck: null,
  query: '',
  locationQuery: '',
  addQuery: '',
  employeeQuery: '',
  showEmployeeForm: false,
  filter: 'all',
  notice: '',
  error: '',
};
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
  try {
    res = await fetch(API + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
      },
    });
  } catch (netErr) {
    const err = new Error('Cannot reach the Guardian server. Check the connection and try again.');
    err.network = true;
    throw err;
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    if (path === '/api/login' && res.status === 401) throw new Error('Wrong password or user ID. Try again.');
    const detail = Array.isArray(data.detail)
      ? data.detail.map((x) => x.msg || x.message || String(x)).join('; ')
      : data.detail;
    throw new Error(detail || 'Request failed');
  }
  return data;
}
// Screen templates: each returns an HTML string for one screen. Nothing here
// touches the network; data comes from `state`.
function nav() {
  const items = [
    ['home', '⌂', 'Home'],
    ['attendance', '◷', 'Attendance'],
    ['reports', '▦', 'Reports'],
    ['settings', '⚙', 'Settings'],
  ];
  return `<div class="bottomNav">${items.map(([k, i, l]) => `<button class="navItem ${(k === 'home' && ['home', 'dashboard'].includes(state.screen)) || state.screen === k || (k === 'attendance' && ['attendance', 'add', 'checkout', 'confirmed'].includes(state.screen)) ? 'active' : ''}" data-nav="${k}"><b>${i}</b>${l}</button>`).join('')}</div>`;
}
function header() {
  return `<div class="top"><button class="menuButton" data-go="menu">☰</button><span class="brand">Guardian</span></div>`;
}
function message() {
  return `${state.error && state.screen !== 'login' ? `<div class="error">${esc(state.error)}</div>` : ''}${state.notice ? `<div class="toast">${esc(state.notice)}</div>` : ''}`;
}
function login() {
  return `<div class="page noNav login"><div class="logo">G</div><h1>Guardian</h1><p class="sub">Sign in to manage today's attendance</p>${state.error ? `<div class="error" role="alert" style="margin-bottom:16px">${esc(state.error)}</div>` : ''}<form id="loginForm"><div class="field"><label>User ID</label><input name="username" placeholder="Enter your user ID" autocomplete="username" required></div><div class="field"><label>Password</label><input name="password" type="password" placeholder="Enter your password" autocomplete="current-password" required></div><div class="forgot"><button type="button" class="link" id="forgot">Forgot password?</button></div><button class="primary">Sign in</button></form><div class="demoBox"><b>DEMO ACCESS</b>Admin: admin.demo / demo123<br>Supervisor: supervisor.demo / demo123</div><div class="footerNote">© 2026 Guardian</div></div>${message()}`;
}
function locationSupervisorField() {
  const access = state.settings?.access;
  const supervisors = Array.isArray(access) ? access.filter((u) => u.role === 'supervisor') : [];
  return `<div class="field"><label for="locationSupervisor">Assign to supervisor</label><select id="locationSupervisor" name="supervisor_id" required ${!Array.isArray(access) ? 'disabled' : ''}><option value="" disabled selected>Choose a supervisor or leave unassigned</option>${supervisors.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join('')}<option value="__unassigned__">Leave unassigned</option></select><small id="locationSupervisorSelection" class="helper" style="display:block;margin-top:6px">No supervisor selected.</small><small class="helper" style="display:block;margin-top:4px">${!Array.isArray(access) ? 'Supervisor list unavailable. Reopen this form to retry.' : supervisors.length ? 'Only the selected supervisor gets access. Existing assignments stay unchanged.' : 'No supervisor accounts yet. Leave unassigned, then create a supervisor in Settings > User access.'}</small></div>`;
}
function locations() {
  const shown = state.locations.filter(
    (l) => !state.locationQuery || (l.name + ' ' + l.area).toLowerCase().includes(state.locationQuery.toLowerCase()),
  );
  const empty = state.locationQuery ? 'No locations match.' : 'No locations yet.';
  const tools =
    state.user?.role === 'admin'
      ? `${[
          ['directory', 'Location directory', plural(state.locations.length, 'location') + ' · Search by name or area'],
          ['add', 'Add location', 'Create a new branch'],
          ['import', 'Import locations', 'Upload a CSV location list'],
        ]
          .map(
            ([k, t, d]) =>
              `<button class="navLink" data-locaction="${k}"><span><strong>${t}</strong><small>${d}</small></span><span>›</span></button>`,
          )
          .join(
            '',
          )}<input type="file" id="importLocationFile" accept=".csv,text/csv" style="display:none">${state.showLocationForm ? `<div class="card addCard"><strong>Add location</strong><p>Create a branch supervisors can record attendance for.</p><form id="locationForm"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Area</label><input name="area" required></div>${locationSupervisorField()}<button class="secondary" ${!Array.isArray(state.settings?.access) ? 'disabled' : ''}>Save location</button></form></div>` : ''}`
      : '';
  return `<div class="page">${header()}<h1>Locations</h1><p class="sub">${state.user?.role === 'admin' ? 'Select, add or import the branch where you are recording attendance.' : 'View your assigned branches and choose where to record attendance.'}</p>${tools}<input class="search" id="locSearch" placeholder="Search locations" value="${esc(state.locationQuery)}"><div id="locationList">${shown.map((l) => `<button class="locationCard ${state.location?.id === l.id ? 'active' : ''}" data-loc="${esc(l.id)}"><span class="locIcon">✥</span><span><strong>${esc(l.name)}</strong><span>${esc(l.area)} · ${plural(l.assigned_count, 'employee')}</span></span><span class="chev">›</span></button>`).join('') || `<p class="muted small">${empty}</p>`}</div><button class="primary" id="continueLoc" ${state.location ? '' : 'disabled'}>Continue</button><p class="helper">You can switch locations later</p></div>${nav()}${message()}`;
}
function attendanceLocationPicker() {
  return state.locations.length > 1
    ? `<div class="field"><label for="attendanceLocation">Attendance location</label><select id="attendanceLocation">${state.locations.map((l) => `<option value="${esc(l.id)}" ${state.location?.id === l.id ? 'selected' : ''}>${esc(l.name)} · ${esc(l.area)}</option>`).join('')}</select></div>`
    : '';
}
function attendance() {
  const s = state.summary || {};
  const rows = state.attendance;
  const total = (s.checked_in || 0) + (s.completed || 0) + (s.not_in || 0);
  if (!state.location)
    return `<div class="page">${header()}<h1>Mark attendance</h1><p class="sub">${fmtDate(new Date())}</p><div class="card addCard"><strong>${state.user?.role === 'admin' ? 'No location set up yet' : 'No location access assigned'}</strong><p>${state.user?.role === 'admin' ? 'Attendance is recorded per branch. Add a location first, then mark check-ins here.' : 'Your admin needs to give you location access before you can view employees or mark attendance.'}</p>${state.user?.role === 'admin' ? '<button class="primary" data-go="locations">Go to Locations</button>' : ''}</div></div>${nav()}${message()}`;
  return `<div class="page">${header()}<h1>Mark attendance</h1><p class="sub">${fmtDate(new Date())} · ${esc(state.location?.name || '')}</p>${attendanceLocationPicker()}<div class="hero"><small>TODAY'S ATTENDANCE</small><strong>${total}</strong> <span>${plural(total, 'employee')} at this location</span></div><div class="stats"><div class="stat green"><strong>${s.checked_in || 0}</strong><span>Checked in</span></div><div class="stat amber"><strong>${s.not_in || 0}</strong><span>To check in</span></div><div class="stat blue"><strong>${s.completed || 0}</strong><span>Completed</span></div></div><h2 class="sectionTitle">Employee attendance</h2><input class="search" id="attSearch" placeholder="Search by name or employee ID" value="${esc(state.query)}"><div class="filters"><button class="chip ${state.filter === 'all' ? 'active' : ''}" data-filter="all">All ${(s.checked_in || 0) + (s.completed || 0) + (s.not_in || 0)}</button><button class="chip green ${state.filter === 'checked_in' ? 'active' : ''}" data-filter="checked_in">Checked in</button><button class="chip amber ${state.filter === 'not_in' ? 'active' : ''}" data-filter="not_in">Not in</button></div>${rows.map((r) => `<div class="person"><span class="initials">${esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.employee_id)}</small></span><span class="personTime">${r.check_in ? fmtTime(r.check_in) : '-'}<br><span class="badge ${r.status === 'checked_in' ? 'green' : r.status === 'completed' ? 'blue' : 'amber'}">${r.status === 'checked_in' ? 'Checked in' : r.status === 'completed' ? 'Completed' : 'Not checked in'}</span></span></div>`).join('') || '<p class="muted small">No employees match.</p>'}<button class="primary" data-go="add">Mark Check-in · ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date())}</button><button class="secondary" style="margin-top:10px" data-go="checkout">Manage check-outs</button></div>${nav()}${message()}`;
}
function add() {
  const available = state.attendance.filter(
    (r) =>
      r.status === 'not_in' &&
      (!state.addQuery || (r.name + ' ' + r.employee_id).toLowerCase().includes(state.addQuery.toLowerCase())),
  );
  return `<div class="page">${header()}<h1>Employee check-in</h1><p class="sub">Choose an existing employee to record their check-in.</p><input class="search" id="addSearch" placeholder="Search name or employee ID" value="${esc(state.addQuery)}"><h2 class="sectionTitle">Available employees</h2>${available.map((r) => `<div class="person"><span class="initials">${esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.employee_id)}</small></span><button class="selectBtn" data-select="${esc(r.employee_id)}">Select</button></div>`).join('') || '<p class="muted small">No waiting employees match.</p>'}${state.user?.role === 'admin' ? `<div class="card addCard"><strong>Can't find the employee?</strong><p>Add a new employee to this location.</p><button class="link" id="toggleNew">+ Create new employee</button><form id="newEmployee" style="display:none;margin-top:14px"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Phone</label><input name="phone" required></div><button class="secondary">Save employee</button></form></div>` : '<p class="muted small">Only admins can create employees. Contact your admin if an employee is missing.</p>'}${state.selected ? `<div class="selected"><b>Selected employee: ${esc(state.selected.name)}</b><br>${esc(state.selected.employee_id)} · ${esc(state.location.name)}</div><button class="primary" id="doCheckin">Mark Check-in · ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date())}</button>` : ''}<p style="text-align:center;margin-top:16px"><button class="link" data-go="attendance">Back to attendance list</button></p></div>${nav()}${message()}`;
}
function confirmed() {
  const r = state.lastCheck;
  return `<div class="page">${header()}<h1>Check-in recorded</h1><p class="sub">Attendance has been successfully updated.</p><div class="card confirmCard"><div class="successIcon">✓</div><h2>${esc(r?.name || 'Employee')}</h2><p class="muted small">${esc(r?.employee_id || '')} · ${esc(state.location?.name.split(' - ')[1] || '')}</p><span class="badge green">CHECKED IN</span><div class="timeLabel">CHECK-IN TIME</div><div class="bigTime">${fmtTime(r?.check_in)}</div><div class="muted small">${fmtDate(new Date())}</div></div><button class="primary" data-go="add">+ Add another employee</button><p style="text-align:center;margin-top:16px"><button class="link" data-go="attendance">Back to attendance list</button></p></div>${nav()}${message()}`;
}
function checkout() {
  const rows = state.attendance.filter((r) => r.status === 'checked_in');
  return `<div class="page">${header()}<h1>Manage check-outs</h1><p class="sub">Employees currently checked in at ${esc(state.location?.name.split(' - ')[1] || '')}.</p><div class="hero"><small>STILL CHECKED IN</small><strong>${rows.length}</strong> <span>${plural(rows.length, 'employee')}</span></div><input class="search" id="outSearch" placeholder="Search checked-in employees">${rows.map((r) => `<div class="person"><span class="initials">${esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>In: ${fmtTime(r.check_in)}</small></span><button class="outlineBtn" data-checkout="${esc(r.employee_id)}">Check out</button></div>`).join('') || '<p class="muted small">No checked-in employees remain.</p>'}<p style="text-align:center;margin-top:18px"><button class="link" data-go="attendance">View attendance list</button></p></div>${nav()}${message()}`;
}
async function dashboard() {
  if (!state.dashboard) state.dashboard = await api('/api/dashboard');
  const d = state.dashboard;
  return `<div class="page">${header()}<h1>Attendance overview</h1><p class="sub">Today's summary across all assigned locations.</p><div class="grid2"><div class="dashStat"><strong>${d.employees}</strong><span>Employees</span></div><div class="dashStat"><strong style="color:var(--green)">${d.checked_in}</strong><span>Checked in</span></div><div class="dashStat"><strong>${d.completed}</strong><span>Completed</span></div><div class="dashStat"><strong style="color:var(--amber)">${d.not_checked_in}</strong><span>Not checked in</span></div></div><h2 class="sectionTitle">Location breakdown</h2>${d.locations.map((l) => `<div class="card listCard"><span><strong>${esc(l.name.split(' - ')[1] || l.name)}</strong><small>${plural(l.assigned_count, 'employee')}</small></span><span style="text-align:right"><span class="badge green">${l.today.checked_in} checked in</span><small>${l.today.completed} completed</small></span></div>`).join('')}<h2 class="sectionTitle">Quick actions</h2><button class="primary" data-go="reports">View attendance report</button></div>${nav()}${message()}`;
}
function menu() {
  return `<div class="navPanel">${header()}<h1>Navigation</h1><p class="sub">${esc(state.user?.name || '')} · ${esc(state.location?.name.split(' - ')[1] || 'All locations')}</p>${[
    ['dashboard', 'Dashboard', 'Overview of all locations'],
    ['attendance', 'Mark attendance', 'Record employee check-ins'],
    ['checkout', 'Manage check-outs', 'Close checked-in shifts'],
    ['locations', 'Locations', 'Choose a branch'],
    ['employees', 'Employees', 'Employee directory'],
    ['reports', 'Reports', 'Attendance summaries'],
    ['settings', 'Settings', 'Account and access'],
  ]
    .map(
      ([s, t, d]) =>
        `<button class="navLink" data-go="${s}"><span><strong>${t}</strong><small>${d}</small></span><span>›</span></button>`,
    )
    .join('')}<button class="secondary" id="logout" style="margin-top:20px">Sign out</button></div>${message()}`;
}
function employees() {
  const shown = state.employees.filter(
    (e) =>
      !state.employeeQuery ||
      (e.name + ' ' + e.id + ' ' + e.role).toLowerCase().includes(state.employeeQuery.toLowerCase()),
  );
  const form =
    state.user?.role === 'admin' && state.showEmployeeForm
      ? `<div class="card addCard"><strong>Add employee</strong><p>Create an employee record for one of your locations.</p>${state.locations.length ? `<form id="employeeForm"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Phone</label><input name="phone" required></div><div class="field"><label>Location</label><select name="location_id" required>${state.locations.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div><button class="secondary">Save employee</button></form>` : '<p class="muted small">Add a location before adding employees.</p><button class="secondary" data-go="locations">Open locations</button>'}</div>`
      : '';
  return `<div class="page">${header()}<h1>Employees</h1><p class="sub">${state.user?.role === 'admin' ? 'Browse and manage people assigned to your locations.' : 'View employees assigned to your locations. Admins manage employee records.'}</p>${[
    ['directory', 'Employee directory', plural(state.employees.length, 'employee') + ' · Search by name or ID'],
    ...(state.user?.role === 'admin'
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
    )}${state.user?.role === 'admin' ? '<input type="file" id="importFile" accept=".csv,text/csv" style="display:none">' : ''}${form}<input class="search" id="empSearch" placeholder="Search name, role or employee ID" value="${esc(state.employeeQuery)}"><div id="directoryList">${shown.map((e) => `<div class="person"><span class="initials">${esc(initials(e.name))}</span><span><strong>${esc(e.name)}</strong><small>${esc(e.id)} · ${esc(e.role)}</small></span></div>`).join('') || '<p class="muted small">No employees match.</p>'}</div></div>${nav()}${message()}`;
}
// Reports screen: Day / Month / History tabs. Everything it shows comes from
// state.report; loadReport() fetches the data for the open tab.
const STATUS_LABEL = { checked_in: 'On duty', completed: 'Done', not_in: 'Not in' };
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
  wifiOff: svgIcon('<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18"/>', 30, 1.8),
  emptyDay: svgIcon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', 30, 1.8),
  chart: svgIcon('<path d="M5 20V10M12 20V4M19 20v-7"/>', 30, 1.8),
  emptyPin: svgIcon('<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>', 30, 1.8),
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
  return emptyState(
    ICON.wifiOff,
    'Could not load the report',
    r.error + ' Your filters stay the same.',
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
  return `<div class="rpFilters"><div class="rpPeriod"><button class="rpSelect" id="reportPeriodBtn" aria-label="${isDay ? 'Change date' : 'Change month'}">${ICON.calendar}<span>${esc(isDay ? fmtShortDay(r.date) : fmtShortMonth(r.month))}</span>${ICON.chevDown}</button><input class="rpHiddenInput" id="reportPeriod" type="${isDay ? 'date' : 'month'}" value="${esc(isDay ? r.date : r.month)}" tabindex="-1" aria-hidden="true"></div><button class="rpSelect" id="reportLocation" aria-haspopup="dialog" aria-label="Change location">${ICON.pin}<span>${esc(locLabel)}</span>${ICON.chevDown}</button></div>`;
}
function guardRow(x) {
  const time =
    x.status === 'completed'
      ? `${fmtTime(x.check_in)} – ${fmtTime(x.check_out)}`
      : x.status === 'checked_in'
        ? 'In ' + fmtTime(x.check_in)
        : '—';
  const badge =
    x.status === 'completed' && x.hours ? `Done · ${Number(x.hours).toFixed(1)} h` : STATUS_LABEL[x.status] || x.status;
  return `<div class="rpRow"><span class="rpAvatar ${x.status === 'not_in' ? 'amber' : ''}" aria-hidden="true">${esc(initials(x.employee_name))}</span><span class="rpWho"><strong>${esc(x.employee_name)}</strong><small>${esc(x.employee_id)}</small></span><span class="rpWhen"><span>${time}</span><span class="badge ${STATUS_TONE[x.status] || 'blue'}">${esc(badge)}</span></span></div>`;
}
function dayReport(r) {
  if (!r.dayLocation)
    return emptyState(ICON.emptyPin, 'No location yet', 'You need access to a location before you can see a report.');
  const rows = r.day?.rows || [];
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
    ['all', 'All'],
    ['checked_in', 'On duty'],
    ['completed', 'Done'],
    ['not_in', 'Not in'],
  ]
    .map(
      ([k, l]) =>
        `<button class="rpStat ${k} ${r.status === k ? 'active' : ''}" data-rstatus="${k}" aria-pressed="${r.status === k}"><strong>${count(k)}</strong><span>${l}</span></button>`,
    )
    .join('');
  const shown = rows.filter((x) => r.status === 'all' || x.status === r.status);
  const hours = rows.map((x) => x.hours).filter(Boolean);
  const avg = hours.length ? (hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1) : '';
  const title = r.status === 'all' ? plural(rows.length, 'guard') : `${shown.length} ${STATUS_LABEL[r.status].toLowerCase()}`;
  const side =
    r.status !== 'all'
      ? '<button class="link" data-rstatus="all">Show all</button>'
      : avg
        ? `<span>Avg shift ${avg} h</span>`
        : '';
  return `<div class="rpStats" role="group" aria-label="Filter by status">${stats}</div><p class="rpHint">Tap a figure to filter the list</p><div class="rpListHead"><strong>${esc(title)}</strong>${side}</div><div class="rpList">${shown.map(guardRow).join('') || '<p class="rpNone">Nobody in this group.</p>'}</div>`;
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
      return `<button class="rpLoc" data-rdetail="${esc(l.id)}"><span class="rpLocHead"><span><strong>${esc(shortLoc(l.name))}</strong><small>${esc((city ? city + ' · ' : '') + plural(l.assigned_count, 'guard'))}</small></span><span class="badge ${l.records && lp.pct === 100 ? 'green' : l.records ? 'amber' : 'blue'}">${l.records ? lp.pct + '%' : 'No records'}</span>${ICON.chevRight}</span>${lp.bar}<span class="rpFigures"><span><strong>${fmtCount(l.records)}</strong>Records</span><span><strong>${fmtCount(l.records - l.completed)}</strong>Open</span><span><strong>${l.avg_hours ? l.avg_hours.toFixed(1) + ' h' : '–'}</strong>Avg shift</span></span></button>`;
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
        ? `${x.completed} done · ${x.checked_in} on duty · ${x.not_in} not in`
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
  return `<div class="rpListHead"><strong class="rpListTitle">Last 6 months</strong><span>${state.user?.role === 'admin' ? 'All locations' : 'Your locations'}</span></div><div class="rpList">${rows}</div><p class="rpHint center">Each download is one Excel file for the whole month.</p>`;
}
function locationSheet(r) {
  const isDay = r.tab === 'day';
  const current = isDay ? r.dayLocation : r.monthLocation;
  const options = (isDay ? [] : [{ id: '', name: 'All locations', area: plural(state.locations.length, 'location') }])
    .concat(state.locations)
    .map((l) => {
      const on = l.id === current;
      const meta = l.id
        ? [locCity(l.name), l.area, plural(l.assigned_count, 'guard')].filter(Boolean).join(' · ')
        : l.area;
      return `<button role="radio" aria-checked="${on}" class="rpOption ${on ? 'active' : ''}" data-rloc="${esc(l.id)}"><span><strong>${esc(l.id ? shortLoc(l.name) : l.name)}</strong><small>${esc(meta)}</small></span>${on ? ICON.check : ''}</button>`;
    })
    .join('');
  return `<div class="rpScrim" data-rsheet-close></div><div class="rpSheet" role="dialog" aria-modal="true" aria-labelledby="rpSheetTitle"><span class="rpHandle" aria-hidden="true"></span><div class="rpSheetHead"><h2 id="rpSheetTitle">Choose location</h2><button class="rpClose" data-rsheet-close aria-label="Close">${ICON.close}</button></div>${state.user?.role !== 'admin' ? '<p>You see only the locations assigned to you.</p>' : ''}<div role="radiogroup" aria-label="Location">${options}</div></div>`;
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
function settings() {
  const d = state.settings;
  const accessCount = d ? d.access.length : null;
  let panel = '';
  if (d && state.settingsView === 'profile')
    panel = `<div class="card" style="padding:16px;margin:12px 0"><h2 class="sectionTitle" style="margin-top:0">My profile</h2><form id="profileForm"><div class="field"><label>Name</label><input name="name" value="${esc(d.profile.name)}" required></div><div class="field"><label>User ID</label><input value="${esc(d.profile.id)}" disabled></div><button class="secondary">Save profile</button></form></div>`;
  if (d && state.settingsView === 'locations')
    panel = `<div class="card" style="padding:16px;margin:12px 0"><h2 class="sectionTitle" style="margin-top:0">Locations</h2>${d.locations.map((l) => `<div class="person"><span><strong>${esc(l.name)}</strong><small>${esc(l.area)} · ${plural(l.assigned_count, 'employee')}</small></span></div>`).join('') || '<p class="muted small">No locations yet. Add the first branch below.</p>'}${state.user.role === 'admin' ? `<form id="locationForm" style="margin-top:14px"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Area</label><input name="area" required></div>${locationSupervisorField()}<button class="secondary" ${!Array.isArray(state.settings?.access) ? 'disabled' : ''}>Add location</button></form>` : '<p class="muted small">Supervisors can view assigned locations. Admins manage branches.</p>'}</div>`;
  if (d && state.settingsView === 'access')
    panel = `<div class="card" style="padding:16px;margin:12px 0"><h2 class="sectionTitle" style="margin-top:0">User access</h2>${d.access.map((u) => `<div class="person"><span><strong>${esc(u.name)}</strong><small>${esc(u.id)} · ${esc(u.role)} · ${esc(u.role === 'admin' ? 'All locations' : u.location_ids.join(', ') || 'No locations')}</small></span></div>`).join('')}${state.user.role === 'admin' ? `<form id="accessForm" style="margin-top:14px"><div class="field"><label>User ID</label><input name="id" required></div><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Temporary password (12+ characters)</label><input name="password" type="password" required></div><div class="field"><label>Locations</label><select name="location_ids" multiple size="3">${d.locations.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div><button class="secondary">Create supervisor</button></form>` : '<p class="muted small">Only admins can create or change access.</p>'}</div>`;
  return `<div class="page">${header()}<h1>Settings</h1><p class="sub">Manage your account and app preferences.</p>${[
    [
      'profile',
      'My profile',
      esc((d ? d.profile.name : state.user?.name) + ' · ' + (d ? d.profile.id : state.user?.id)),
    ],
    ['locations', 'Locations', 'View assigned branches and admin controls'],
    ['access', 'User access', 'View roles and location scope'],
  ]
    .map(
      ([k, t, sub]) =>
        `<button class="navLink" data-settings="${k}"><span><strong>${t}</strong><small>${sub}</small></span><span class="badge ${state.settingsView === k ? 'green' : 'blue'}">${k === 'locations' ? (d ? d.locations.length : state.locations.length) : k === 'access' ? (d ? plural(accessCount, 'user') : '›') : '›'}</span></button>`,
    )
    .join(
      '',
    )}${panel}<button class="secondary" id="logout" style="margin-top:18px">Sign out</button></div>${nav()}${message()}`;
}
// Paint the current state into #app, then bind the events the new markup needs.
async function render() {
  let html = '';
  try {
    if (!state.token) html = login();
    else if (state.screen === 'locations') {
      if (state.showLocationForm && state.user?.role === 'admin' && !state.settings)
        state.settings = await api('/api/settings');
      html = locations();
    } else if (state.screen === 'attendance') html = attendance();
    else if (state.screen === 'add') html = add();
    else if (state.screen === 'confirmed') html = confirmed();
    else if (state.screen === 'checkout') html = checkout();
    else if (state.screen === 'dashboard' || state.screen === 'home') html = await dashboard();
    else if (state.screen === 'menu') html = menu();
    else if (state.screen === 'employees') html = employees();
    else if (state.screen === 'reports') html = reports();
    else if (state.screen === 'settings') html = settings();
    else html = locations();
  } catch (e) {
    state.error = e.message;
    html = state.token ? locations() : login();
  }
  $app.innerHTML = html;
  bind();
}
// Wire up clicks/inputs on the freshly rendered markup. One branch per screen.
function bind() {
  document.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
  document.querySelectorAll('[data-filter]').forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.filter;
        loadAttendance();
      }),
  );
  const lf = document.getElementById('loginForm');
  if (lf) lf.onsubmit = doLogin;
  document.querySelectorAll('[data-loc]').forEach(
    (b) =>
      (b.onclick = () => {
        state.location = state.locations.find((l) => l.id === b.dataset.loc);
        render();
      }),
  );
  const cl = document.getElementById('continueLoc');
  if (cl)
    cl.onclick = async () => {
      await loadAttendance();
      go('attendance');
    };
  const al = document.getElementById('attendanceLocation');
  if (al)
    al.onchange = async (e) => {
      state.location = state.locations.find((l) => l.id === e.target.value);
      state.selected = null;
      state.query = '';
      state.filter = 'all';
      state.attendance = [];
      state.summary = {};
      render();
      try {
        await loadAttendance();
      } catch (err) {
        state.error = err.message;
        render();
      }
    };
  const as = document.getElementById('attSearch');
  if (as)
    as.oninput = (e) => {
      state.query = e.target.value;
      clearTimeout(window.q);
      window.q = setTimeout(loadAttendance, 250);
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
    };
  document.querySelectorAll('[data-select]').forEach(
    (b) =>
      (b.onclick = () => {
        state.selected = state.attendance.find((r) => r.employee_id === b.dataset.select);
        render();
      }),
  );
  const dc = document.getElementById('doCheckin');
  if (dc) dc.onclick = doCheckin;
  document.querySelectorAll('[data-checkout]').forEach((b) => (b.onclick = () => doCheckout(b.dataset.checkout)));
  const tn = document.getElementById('toggleNew');
  if (tn)
    tn.onclick = () => {
      document.getElementById('newEmployee').style.display = 'block';
    };
  const ne = document.getElementById('newEmployee');
  if (ne) ne.onsubmit = doNewEmployee;
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
  const ef = document.getElementById('employeeForm');
  if (ef) ef.onsubmit = createEmployee;
  const acf = document.getElementById('accessForm');
  if (acf) acf.onsubmit = createAccess;
  bindReports();
}
// In-app history: hash changes (#attendance, #reports, ...) are kept in sync with
// an internal stack so the hardware/browser Back button walks back screen by screen
// instead of leaving the app.
const appScreens = [
  'locations',
  'attendance',
  'add',
  'confirmed',
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
  state.error = '';
  state.notice = '';
  if (screen === 'home') screen = state.user?.role === 'admin' ? 'dashboard' : 'attendance';
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
    loadAttendance().then(render);
    return;
  }
  if (screen === 'employees') {
    loadEmployees();
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
    await bootstrap();
    state.notice = '';
    if (state.location) await loadAttendance();
    state.screen = 'attendance';
    startHistory('attendance');
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
  state.location = state.locations.some((l) => l.id === state.location?.id) ? state.location : state.locations[0];
  state.showLocationForm = !state.locations.length && state.user?.role === 'admin';
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
    render();
  } catch (err) {
    if (isCurrent()) throw err;
  }
}
async function loadEmployees(renderNow = true) {
  state.employees = await api('/api/employees');
  if (renderNow) render();
}
async function doCheckin() {
  try {
    state.lastCheck = await api('/api/attendance/checkin', {
      method: 'POST',
      body: JSON.stringify({ employee_id: state.selected.employee_id, location_id: state.location.id }),
    });
    state.selected = null;
    state.dashboard = null;
    await loadAttendance();
    go('confirmed');
  } catch (e) {
    state.error = e.message;
    render();
  }
}
async function doCheckout(id) {
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
    state.error = e.message;
    render();
  }
}
// Employee creation from the Add screen.
async function doNewEmployee(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ ...f, location_id: state.location.id }),
    });
    state.employees = [];
    state.locations = await api('/api/locations');
    state.dashboard = null;
    await loadAttendance();
    toast('Employee added');
  } catch (err) {
    state.error = err.message;
    render();
  }
}
async function createEmployee(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    await api('/api/employees', { method: 'POST', body: JSON.stringify({ ...f, role: 'Guard' }) });
    state.locations = await api('/api/locations');
    state.dashboard = null;
    await loadEmployees(false);
    state.showEmployeeForm = false;
    toast('Employee added');
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
  const periodButton = document.getElementById('reportPeriodBtn');
  const periodInput = document.getElementById('reportPeriod');
  if (periodButton && periodInput) {
    periodButton.onclick = () => {
      try {
        periodInput.showPicker();
      } catch {
        periodInput.focus();
        periodInput.click();
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
    go('settings', { settingsView: kind });
  } catch (e) {
    state.error = e.message;
    render();
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
// Excel exports: monthly summaries and filtered daily/location reports.
// The server streams a file; we hand the response to the browser as a download.
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
    toast('Imported ' + r.created + ' new and updated ' + r.updated + ' employees');
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
  state.token = '';
  state.user = null;
  state.report = null;
  state.screen = 'login';
  history.replaceState({ gfScreen: 'login' }, '', '#login');
  render();
}
(async () => {
  if (state.token) {
    try {
      await bootstrap();
      const requested = location.hash.slice(1);
      state.screen = appScreens.includes(requested) ? requested : 'attendance';
      if (state.screen === 'attendance' && state.location) await loadAttendance();
      startHistory(state.screen);
    } catch {
      localStorage.removeItem('gf_token');
      state.token = '';
      state.screen = 'login';
      history.replaceState({ gfScreen: 'login' }, '', '#login');
    }
  } else history.replaceState({ gfScreen: 'login' }, '', '#login');
  render();
})();
