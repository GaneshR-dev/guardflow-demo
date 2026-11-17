import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { shortLoc } from '@/lib/format';
import type { AuditRow, Employee, SettingsAnswer } from '@/types/api';

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsAnswer>('/api/settings') });

// The same query that the Guards screen uses, so the list is in the cache when it opens.
export const useEmployees = () =>
  useQuery({ queryKey: ['employees'], queryFn: () => api<Employee[]>('/api/employees') });

export const useAudit = () =>
  useQuery({ queryKey: ['audit'], queryFn: () => api<{ rows: AuditRow[] }>('/api/audit').then((r) => r.rows) });

export function siteName(d: SettingsAnswer | undefined, id: string) {
  const site = d?.locations.find((l) => l.id === id);
  return site ? shortLoc(site.name) : id;
}

// The note after a change that leaves sites with no supervisor.
export function unsupervisedNote(d: SettingsAnswer | undefined, ids: string[] | undefined) {
  if (!ids?.length) return '';
  return ` No supervisor is left at ${ids.map((id) => siteName(d, id)).join(', ')}.`;
}

// Activity log titles, in the words of docs/GLOSSARY.md.
export const AUDIT_TITLES: Record<string, string> = {
  'attendance.checkin': 'Check-in',
  'attendance.checkout': 'Check-out',
  'attendance.times.edit': 'Time correction',
  'employee.create': 'Guard added',
  'employee.disable': 'Guard disabled',
  'employee.enable': 'Guard enabled',
  'employee.import': 'Guards imported',
  'employee.transfer': 'Guard moved to another site',
  'settings.location.create': 'Site added',
  'settings.location.shifts': 'Site shifts changed',
  'settings.location.disable': 'Site disabled',
  'settings.location.enable': 'Site enabled',
  'settings.location.import': 'Sites imported',
  'settings.access.create': 'User access created',
  'settings.access.locations': 'Supervisor sites changed',
  'settings.access.disable': 'User access disabled',
  'settings.access.enable': 'User access enabled',
  'settings.access.password_reset': 'Password changed',
  'settings.profile.update': 'Profile changed',
};

export const auditTitle = (a: AuditRow) => AUDIT_TITLES[a.action] || 'Change';

export function auditDetail(a: AuditRow) {
  const d = a.details as Record<string, string | number | boolean | undefined>;
  const guard = a.labels.employee_name || (d.employee_id as string) || '';
  const site = a.labels.location_name ? shortLoc(a.labels.location_name) : (d.location_id as string) || '';
  if (a.action === 'attendance.times.edit') return `${guard} · ${d.day || ''} · Reason: ${d.reason || 'not given'}`;
  if (a.action === 'attendance.checkout' && d.late_checkout)
    return `${guard} · ${site} · closed the check-in from ${d.record_day || 'an earlier day'}`;
  if (a.action === 'attendance.checkin' || a.action === 'attendance.checkout') return `${guard} · ${site}`;
  if (a.action === 'employee.transfer')
    return `${guard} · ${a.labels.from_name ? shortLoc(a.labels.from_name) : 'no site'} to ${a.labels.to_name ? shortLoc(a.labels.to_name) : 'no site'}`;
  if (a.action === 'employee.import' || a.action === 'settings.location.import')
    return `${d.created || 0} added · ${d.updated || 0} updated`;
  return guard || site || (d.name as string) || (d.id as string) || '';
}
