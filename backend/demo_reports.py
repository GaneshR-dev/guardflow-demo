"""Typed, timezone-explicit attendance spreadsheets. No attendance writes."""
from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

HEADERS = ['Date', 'Entry time', 'Exit time', 'Employee ID', 'Employee name',
           'Location', 'Status', 'Source', 'Notes']


def excel_timestamp(raw, tz, label, notes):
    if not raw:
        return None
    try:
        stamp = datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
        if stamp.tzinfo is None or stamp.utcoffset() is None:
            raise ValueError('No timezone')
        # Excel has no timezone-aware datetime type. Convert before removing it.
        return stamp.astimezone(tz).replace(tzinfo=None)
    except (ValueError, TypeError, OverflowError):
        notes.append(f'{label}: timezone or timestamp unverified; original text retained')
        return str(raw)


def attendance_workbook(rows, tz, month, day='', location='All permitted locations'):
    wb = Workbook()
    ws = wb.active
    ws.title = 'Attendance'
    ws.append(HEADERS)
    for row in rows:
        notes = []
        try:
            attendance_date = date.fromisoformat(row['day'])
        except (ValueError, TypeError):
            attendance_date = str(row['day'])
            notes.append('Date unverified; original text retained')
        entry = excel_timestamp(row.get('check_in'), tz, 'Entry', notes)
        exit_time = excel_timestamp(row.get('check_out'), tz, 'Exit', notes)
        for label, stamp in [('Entry', entry), ('Exit', exit_time)]:
            if isinstance(stamp, datetime) and isinstance(attendance_date, date) and stamp.date() != attendance_date:
                notes.append(f'{label} date: {stamp.date().isoformat()}')
        values = [attendance_date, entry, exit_time, row['employee_id'], row['name'],
                  row['location'], row['status'].replace('_', ' '), row['source'], '; '.join(notes)]
        ws.append(values)
        for cell in ws[ws.max_row]:
            # User-controlled names/source/IDs must never become spreadsheet formulas.
            if isinstance(cell.value, str):
                cell.data_type = 's'
            cell.alignment = Alignment(vertical='top', wrap_text=True, horizontal='left')
            cell.border = Border(bottom=Side(style='hair', color='E2E8F0'), right=Side(style='hair', color='E2E8F0'))
            cell.font = Font(name='Calibri', size=11)
        ws.cell(ws.max_row, 1).number_format = 'dd mmm yyyy'
        ws.cell(ws.max_row, 2).number_format = 'hh:mm'
        ws.cell(ws.max_row, 3).number_format = 'hh:mm'
        ws.row_dimensions[ws.max_row].height = max(34, 15 * (1 + len('; '.join(notes)) // 44))
    for cell in ws[1]:
        cell.fill = PatternFill('solid', fgColor='17324D')
        cell.font = Font(name='Calibri', bold=True, color='FFFFFF', size=11)
        cell.alignment = Alignment(vertical='center', wrap_text=True)
    ws.row_dimensions[1].height = 28
    for i, width in enumerate([17, 14, 14, 19, 27, 32, 17, 27, 48], 1):
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.freeze_panes = 'D2'
    ws.auto_filter.ref = ws.dimensions
    ws.print_title_rows = '1:1'
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.oddHeader.center.text = f'Guardian attendance | {day or month}'
    ws.oddFooter.left.text = f'Times: {tz.key}'
    ws.oddFooter.right.text = 'Page &P'
    info = wb.create_sheet('Report info')
    for values in [
        ['Guardian attendance report', 'Date / Entry time / Exit time'],
        ['Attendance timezone', tz.key],
        ['Period', day or month],
        ['Location', location],
        ['Date column', 'Stored attendance day. No date or time is guessed.'],
        ['Time columns', '24-hour local time, converted from the saved UTC/offset timestamp. Full local date and time remain in each Excel cell.'],
        ['Missing time', 'Blank means not recorded. It is not midnight or zero.'],
        ['Overnight entry', 'Notes identify an entry/exit date different from the attendance day.'],
        ['Unverified timestamp', 'If a saved value lacks timezone or cannot be parsed, the original text is retained with a note, not converted or invented.'],
        ['Source', 'Preserved per row. Fictional sample history is not real attendance.'],
        ['Scope', 'Only records permitted for the signed-in account and selected filters.'],
        ['Rows', len(rows)],
    ]:
        info.append(values)
    info.column_dimensions['A'].width = 27
    info.column_dimensions['B'].width = 100
    for row in info:
        info.row_dimensions[row[0].row].height = 35
        for cell in row:
            cell.alignment = Alignment(vertical='top', wrap_text=True, horizontal='left')
            cell.border = Border(bottom=Side(style='hair', color='E2E8F0'), right=Side(style='hair', color='E2E8F0'))
            cell.font = Font(name='Calibri', size=11, bold=cell.column == 1)
    info.sheet_properties.pageSetUpPr.fitToPage = True
    info.page_setup.orientation = 'landscape'
    info.page_setup.fitToWidth = 1
    info.page_setup.fitToHeight = 1
    output = BytesIO()
    wb.save(output)
    return output.getvalue()
