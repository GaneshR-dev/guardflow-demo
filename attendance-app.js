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
  history: [],
  monthly: null,
  reportMode: '',
  reportDate: '',
  reportMonth: '',
  reportLocation: '',
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
async function reports() {
  if (!state.history.length) state.history = await api('/api/reports/months?months=6');
  const h = state.history;
  const report = state.monthly;
  const locOptions = state.locations
    .map(
      (l) =>
        `<option value="${esc(l.id)}" ${state.reportLocation === l.id ? 'selected' : ''}>${esc(l.name.split(' - ')[1] || l.name)}</option>`,
    )
    .join('');
  return `<div class="page">${header()}<h1>Attendance reports</h1><p class="sub">Review attendance summaries by date and location.</p>${[
    ['daily', 'Daily report', 'Check-in, check-out and hours'],
    ['locations', 'Location report', 'Compare all assigned branches'],
    ['export', 'Excel report', 'Date, entry time and exit time'],
  ]
    .map(
      ([k, t, d]) =>
        `<button class="navLink" data-report="${k}"><span><strong>${t}</strong><small>${d}</small></span><span>›</span></button>`,
    )
    .join('')}${
    report
      ? `<h2 class="sectionTitle">${esc(report.title)}</h2><button class="secondary" id="exportFilteredReport" style="margin-bottom:12px">Download this report as Excel</button><form id="reportFilters" class="card" style="padding:14px;margin-bottom:12px"><div class="field"><label>${state.reportMode === 'daily' ? 'Date' : 'Month'}</label><input name="period" type="${state.reportMode === 'daily' ? 'date' : 'month'}" value="${esc(state.reportMode === 'daily' ? state.reportDate : state.reportMonth)}" required></div><div class="field"><label>Location</label><select name="location_id">${state.reportMode === 'locations' ? '<option value="">All assigned locations</option>' : ''}${locOptions}</select></div><button class="secondary">Apply filters</button></form><div class="card" style="padding:8px 14px"><div class="reportRow employee head"><span>Date</span><span>Employee</span><span>In</span><span>Out</span><span>Hours</span></div>${
          report.rows
            .slice(0, 50)
            .map(
              (r) =>
                `<div class="reportRow employee"><span>${r.day.slice(5)}</span><span><strong>${esc(r.employee_name)}</strong><br><small class="muted">${esc(r.employee_id)} · ${esc(r.location_name.split(' - ')[1] || r.location_name)} · ${esc(r.status.replace('_', ' '))}</small></span><span>${r.check_in ? fmtTime(r.check_in) : '-'}</span><span>${r.check_out ? fmtTime(r.check_out) : '-'}</span><span>${r.hours ?? '-'}</span></div>`,
            )
            .join('') || '<p class="muted small" style="padding:10px 4px">No records match these filters.</p>'
        }</div>`
      : ''
  }<h2 class="sectionTitle">Last 6 months</h2><div class="card" style="padding:8px 14px"><div class="reportRow head"><span>Month</span><span>Records</span><span>Done</span><span>Export</span></div>${h.map((m) => `<div class="reportRow"><span>${fmtMonth(new Date(m.month + '-01'))}</span><span>${m.total_records}</span><span>${m.completed}</span><span><button class="link" data-export="${esc(m.month)}">Excel</button></span></div>`).join('')}</div><p class="helper">Sample history is fictional and marked in the source field.</p></div>${nav()}${message()}`;
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
    else if (state.screen === 'reports') html = await reports();
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
  const exportFiltered = document.querySelector('#exportFilteredReport');
  if (exportFiltered)
    exportFiltered.onclick = () =>
      exportReport(state.reportMonth, state.reportMode === 'daily' ? state.reportDate : '', state.reportLocation);
  document.querySelectorAll('[data-report]').forEach((b) => (b.onclick = () => openReport(b.dataset.report)));
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
  const rf = document.getElementById('reportFilters');
  if (rf) rf.onsubmit = applyReportFilters;
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
  state.history = [];
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
// Reports: month summaries, daily/location reports and their filters.
async function openReport(kind) {
  const month = todayISO().slice(0, 7);
  if (kind === 'export') {
    exportMonth(month);
    return;
  }
  state.reportMode = kind;
  state.reportDate = todayISO();
  state.reportMonth = month;
  state.reportLocation = kind === 'daily' ? state.location?.id || state.locations[0]?.id || '' : '';
  await loadReport();
}
async function loadReport() {
  try {
    const q = new URLSearchParams({ month: state.reportMonth });
    if (state.reportMode === 'daily') q.set('day', state.reportDate);
    if (state.reportLocation) q.set('location_id', state.reportLocation);
    const r = await api('/api/reports/monthly?' + q);
    state.monthly = {
      title:
        state.reportMode === 'daily'
          ? 'Daily report · ' + fmtDate(new Date(state.reportDate + 'T00:00:00'))
          : 'Location report · ' + fmtMonth(new Date(state.reportMonth + '-01')),
      rows: r.rows,
    };
    render();
  } catch (e) {
    state.error = e.message;
    render();
  }
}
async function applyReportFilters(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  if (state.reportMode === 'daily') {
    state.reportDate = f.get('period');
    state.reportMonth = String(f.get('period')).slice(0, 7);
  } else {
    state.reportMonth = f.get('period');
    state.reportDate = '';
  }
  state.reportLocation = f.get('location_id') || '';
  await loadReport();
}
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
    toast('Excel downloaded');
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
