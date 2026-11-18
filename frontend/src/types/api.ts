// Types for the API answers that the shared code uses. Add a type here when a screen
// moves to React and needs a new endpoint. Keep the names the same as the server fields.

export type Role = 'owner' | 'admin' | 'supervisor';

export interface User {
  id: string;
  name: string;
  role: Role;
  company_id: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Shift {
  label?: string | null;
  shift_start: string;
  shift_end: string;
}

export interface Location {
  id: string;
  name: string;
  area: string;
  assigned_count: number;
  disabled_count?: number;
  active: number;
  shift_start?: string | null;
  shift_end?: string | null;
  shifts?: Shift[];
}

export type AttendanceStatus = 'checked_in' | 'completed' | 'not_in';

export interface Health {
  status: string;
  demo_mode?: boolean;
}

export interface TodayCounts {
  checked_in: number;
  completed: number;
  not_in: number;
}

export interface DashboardLocation extends Location {
  today: TodayCounts;
}

export interface Dashboard {
  day: string;
  employees: number;
  checked_in: number;
  completed: number;
  not_checked_in: number;
  locations: DashboardLocation[];
}

export interface AttendanceRecord {
  // The attendance record ID. Empty for a guard with no record today.
  id: string | null;
  employee_id: string;
  name: string;
  role?: string;
  location_id: string | null;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  // True for a guard from another site who checked in here.
  adhoc?: boolean;
}

export interface StaleOpen {
  day: string;
  employee_id: string;
  name: string;
  check_in: string | null;
  location_id: string;
}

export interface AttendanceAnswer {
  day: string;
  summary: { checked_in: number; completed: number; not_in: number };
  rows: AttendanceRecord[];
  stale_open: StaleOpen[];
}

export interface LookupMatch {
  id: string;
  name: string;
  role?: string;
  location_id: string | null;
  location_name: string | null;
  active: number;
}

export interface CheckinAnswer {
  requires_confirmation?: boolean;
  prior_shifts?: number;
  employee_id: string;
  name: string;
}

export interface CheckoutAnswer {
  employee_id: string;
  name: string;
  // Set when the check-out closed a check-in left open from an earlier day.
  note?: string;
}

export interface AddGuardAnswer {
  id: string;
  warning?: string | null;
}

export interface AccessUser {
  id: string;
  name: string;
  role: 'admin' | 'supervisor' | 'owner';
  active?: number;
  location_ids: string[];
}

export interface SettingsAnswer {
  profile: { id: string; name: string; role: Role; is_owner?: boolean; company_id: string | null };
  company: { id: string; name: string; active: number };
  locations: Location[];
  access: AccessUser[];
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
  location_id: string | null;
  active: number;
}

export interface EmployeeImportAnswer {
  created: number;
  updated: number;
  warnings: string[];
}

export interface AuditRow {
  at: string;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  labels: {
    employee_name?: string | null;
    location_name?: string | null;
    from_name?: string | null;
    to_name?: string | null;
  };
}

// Sites that have no active supervisor after a change.
export interface AccessChange {
  id: string;
  unsupervised?: string[];
}

export interface ReportRow {
  day: string;
  employee_id: string;
  employee_name: string;
  location_id: string;
  location_name: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  hours: number | null;
}

export interface DayReport {
  month: string;
  day: string | null;
  rows: ReportRow[];
}

export interface SummaryBucket {
  records: number;
  completed: number;
  checked_in: number;
  not_in: number;
  avg_hours: number | null;
}

export interface SiteBucket extends SummaryBucket {
  id: string;
  name: string;
  area: string;
  assigned_count: number;
  active: number;
}

export interface MonthSummary {
  month: string;
  location_id: string | null;
  totals: SummaryBucket;
  locations: SiteBucket[];
  days: (SummaryBucket & { day: string })[];
}

export interface HistoryMonth {
  month: string;
  checked_in: number;
  completed: number;
  not_in: number;
  total_records: number;
}
