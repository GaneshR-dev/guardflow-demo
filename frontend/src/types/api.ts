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
