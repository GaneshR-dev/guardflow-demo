import { useMutation, useQuery } from '@tanstack/react-query';
import { api, apiFile } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { AttendanceStatus, DayReport, HistoryMonth, MonthSummary } from '@/types/api';

export type Tab = 'day' | 'month' | 'history';
export type DayFilter = AttendanceStatus | 'all';

// Report data is fresh for 60 seconds. Each set of filters has its own key, so a quick change
// cannot show an old answer.
const FRESH = 60_000;

export const useDayReport = (site: string, date: string, enabled: boolean) =>
  useQuery({
    queryKey: ['report-day', site, date],
    enabled: enabled && !!site && !!date,
    staleTime: FRESH,
    queryFn: () =>
      api<DayReport>(
        '/api/reports/monthly?' + new URLSearchParams({ month: date.slice(0, 7), day: date, location_id: site }),
      ),
  });

export const useMonthReport = (month: string, site: string, enabled: boolean) =>
  useQuery({
    queryKey: ['report-month', month, site],
    enabled: enabled && !!month,
    staleTime: FRESH,
    queryFn: () => {
      const q = new URLSearchParams({ month });
      if (site) q.set('location_id', site);
      return api<MonthSummary>('/api/reports/summary?' + q);
    },
  });

export const useHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ['report-history'],
    enabled,
    staleTime: FRESH,
    queryFn: () => api<HistoryMonth[]>('/api/reports/months?months=6'),
  });

// Download one Excel file: a day (with a site), or a month (all sites or one site).
export function useExcel() {
  return useMutation({
    mutationFn: ({ month, day, site }: { month: string; day?: string; site?: string }) => {
      const q = new URLSearchParams({ month });
      if (day) q.set('day', day);
      if (site) q.set('location_id', site);
      return apiFile('/api/reports/export.xlsx?' + q, `guardian-attendance-${day || month}.xlsx`);
    },
    onSuccess: (file) => toast(`Excel file is ready · ${file}`),
  });
}

export const thisMonth = () => todayISO().slice(0, 7);

// "8.9 h" for an average or a shift.
export const fmtHours = (h: number | null | undefined) => (h ? `${h.toFixed(1)} h` : '–');
