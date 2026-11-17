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
