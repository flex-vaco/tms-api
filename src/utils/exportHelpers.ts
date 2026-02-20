import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

interface TimesheetRow {
  user?: { name?: string; email?: string; department?: string | null } | null;
  weekStartDate: Date | string;
  weekEndDate: Date | string;
  totalHours: number;
  billableHours: number;
  status: string;
}

interface ReportResult {
  timesheets: TimesheetRow[];
  aggregates: {
    totalHours: number;
    billableHours: number;
    nonBillableHours: number;
    utilization: number;
    timesheetCount: number;
  };
}

export interface MonthlyDayRow {
  date: string;       // e.g. "01-Dec"
  day: string;        // e.g. "Monday"
  project: string;
  task: string;
  time: number;
  overtime: number;
  totalTime: number;
  isHoliday: boolean;
  holidayName?: string;
  isLeave: boolean;
  isWeekend: boolean;
}

export interface MonthlyTimesheetData {
  employeeName: string;
  employeeId: number;
  department: string;
  month: string;       // e.g. "Dec'25"
  monthFull: string;   // e.g. "December 2025"
  days: MonthlyDayRow[];
  totalHours: number;
  totalOvertime: number;
  holidayCount: number;
  leaveCount: number;
}

function toDateStr(d: Date | string): string {
  return d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function generateCSV(data: ReportResult): string {
  const headers = ['Employee', 'Email', 'Department', 'Week Start', 'Week End', 'Total Hours', 'Billable Hours', 'Status'];
  const rows = data.timesheets.map((ts) => [
    escapeCsv(ts.user?.name ?? ''),
    escapeCsv(ts.user?.email ?? ''),
    escapeCsv(ts.user?.department ?? ''),
    toDateStr(ts.weekStartDate),
    toDateStr(ts.weekEndDate),
    ts.totalHours.toString(),
    ts.billableHours.toString(),
    ts.status,
  ]);

  const summaryRows = [
    [],
    ['Summary'],
    ['Total Hours', data.aggregates.totalHours.toString()],
    ['Billable Hours', data.aggregates.billableHours.toString()],
    ['Non-Billable Hours', data.aggregates.nonBillableHours.toString()],
    ['Utilization %', `${data.aggregates.utilization}%`],
    ['Timesheet Count', data.aggregates.timesheetCount.toString()],
  ];

  return [
    headers.join(','),
    ...rows.map((r) => r.join(',')),
    ...summaryRows.map((r) => r.join(',')),
  ].join('\n');
}

export async function generateExcel(data: ReportResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');

  // Header row with styling
  sheet.columns = [
    { header: 'Employee', key: 'employee', width: 20 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Department', key: 'department', width: 15 },
    { header: 'Week Start', key: 'weekStart', width: 12 },
    { header: 'Week End', key: 'weekEnd', width: 12 },
    { header: 'Total Hours', key: 'totalHours', width: 12 },
    { header: 'Billable Hours', key: 'billableHours', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C5F7C' } };

  // Data rows
  data.timesheets.forEach((ts) => {
    sheet.addRow({
      employee: ts.user?.name ?? '',
      email: ts.user?.email ?? '',
      department: ts.user?.department ?? '',
      weekStart: toDateStr(ts.weekStartDate),
      weekEnd: toDateStr(ts.weekEndDate),
      totalHours: ts.totalHours,
      billableHours: ts.billableHours,
      status: ts.status,
    });
  });

  // Summary section
  const gap = sheet.rowCount + 2;
  sheet.getCell(`A${gap}`).value = 'Summary';
  sheet.getCell(`A${gap}`).font = { bold: true };
  sheet.getCell(`A${gap + 1}`).value = 'Total Hours';
  sheet.getCell(`B${gap + 1}`).value = data.aggregates.totalHours;
  sheet.getCell(`A${gap + 2}`).value = 'Billable Hours';
  sheet.getCell(`B${gap + 2}`).value = data.aggregates.billableHours;
  sheet.getCell(`A${gap + 3}`).value = 'Non-Billable Hours';
  sheet.getCell(`B${gap + 3}`).value = data.aggregates.nonBillableHours;
  sheet.getCell(`A${gap + 4}`).value = 'Utilization %';
  sheet.getCell(`B${gap + 4}`).value = `${data.aggregates.utilization}%`;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generatePDF(data: ReportResult): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(18).font('Helvetica-Bold').text('Highspring India TMS — Report', { align: 'center' });
    doc.moveDown(0.5);

    // Summary stats
    doc.fontSize(11).font('Helvetica-Bold').text('Summary');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Hours: ${data.aggregates.totalHours}`);
    doc.text(`Billable Hours: ${data.aggregates.billableHours}`);
    doc.text(`Non-Billable Hours: ${data.aggregates.nonBillableHours}`);
    doc.text(`Utilization: ${data.aggregates.utilization}%`);
    doc.text(`Timesheets: ${data.aggregates.timesheetCount}`);
    doc.moveDown();

    // Table header
    const cols = [
      { label: 'Employee', x: 40, width: 120 },
      { label: 'Week Start', x: 160, width: 80 },
      { label: 'Week End', x: 240, width: 80 },
      { label: 'Total Hrs', x: 320, width: 60 },
      { label: 'Billable Hrs', x: 380, width: 70 },
      { label: 'Status', x: 450, width: 70 },
    ];

    const tableTop = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    cols.forEach((col) => {
      doc.text(col.label, col.x, tableTop, { width: col.width });
    });

    doc.moveTo(40, tableTop + 14).lineTo(520, tableTop + 14).stroke();
    let y = tableTop + 18;
    doc.font('Helvetica').fontSize(9);

    data.timesheets.forEach((ts) => {
      if (y > 550) {
        doc.addPage();
        y = 40;
      }
      doc.text(ts.user?.name ?? '', cols[0].x, y, { width: cols[0].width });
      doc.text(toDateStr(ts.weekStartDate), cols[1].x, y, { width: cols[1].width });
      doc.text(toDateStr(ts.weekEndDate), cols[2].x, y, { width: cols[2].width });
      doc.text(String(ts.totalHours), cols[3].x, y, { width: cols[3].width });
      doc.text(String(ts.billableHours), cols[4].x, y, { width: cols[4].width });
      doc.text(ts.status, cols[5].x, y, { width: cols[5].width });
      y += 14;
    });

    doc.end();
  });
}

const ORANGE_HEADER = 'FFE8A44C';
const HOLIDAY_RED = 'FFFF4444';
const HOLIDAY_BG = 'FFFFE0E0';
const LEAVE_YELLOW = 'FFFFFF00';
const LEAVE_BG = 'FFFFFFCC';
const WEEKEND_BG = 'FFF0F0F0';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

export async function generateMonthlyTimesheetExcel(data: MonthlyTimesheetData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Timesheet');

  // Column widths: A=Date(10), B=Day(12), C=Project(28), D=Task(40), E=Time(10), F=Overtime(10), G=Total(10)
  sheet.getColumn('A').width = 10;
  sheet.getColumn('B').width = 12;
  sheet.getColumn('C').width = 28;
  sheet.getColumn('D').width = 40;
  sheet.getColumn('E').width = 10;
  sheet.getColumn('F').width = 10;
  sheet.getColumn('G').width = 12;

  // --- Row 1: Name / Emp Code / Process ---
  const r1 = sheet.getRow(1);
  r1.getCell('A').value = 'Name -';
  r1.getCell('A').font = { bold: true, size: 10 };
  r1.getCell('B').value = data.employeeName;
  r1.getCell('B').font = { bold: true, size: 10 };
  r1.getCell('D').value = 'Emp Code';
  r1.getCell('D').font = { bold: true, size: 10 };
  r1.getCell('E').value = `EMP${String(data.employeeId).padStart(4, '0')}`;
  r1.getCell('E').font = { size: 10 };
  r1.getCell('F').value = 'Process';
  r1.getCell('F').font = { bold: true, size: 10 };
  r1.getCell('G').value = data.department || 'Fullsteam';
  r1.getCell('G').font = { size: 10 };

  // --- Row 2: Month ---
  const r2 = sheet.getRow(2);
  r2.getCell('A').value = 'Month -';
  r2.getCell('A').font = { bold: true, size: 10 };
  r2.getCell('B').value = data.month;
  r2.getCell('B').font = { bold: true, size: 10 };

  // --- Row 3: blank ---

  // --- Row 4: Column Headers ---
  const headerRowNum = 4;
  const hdr = sheet.getRow(headerRowNum);
  const headers = ['Date', 'Day', 'Project / BD Lead /Others activity', 'Task', 'Time', 'Over time', 'Total Time'];
  headers.forEach((label, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_HEADER } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: i >= 4 ? 'center' : 'left', vertical: 'middle' };
  });

  // --- Day Rows ---
  let rowNum = 5;
  for (const day of data.days) {
    const row = sheet.getRow(rowNum);

    row.getCell('A').value = day.date;
    row.getCell('B').value = day.day;

    if (day.isHoliday) {
      row.getCell('C').value = day.project;
      row.getCell('D').value = `Holiday - ${day.holidayName ?? 'Holiday'}`;
    } else if (day.isLeave) {
      row.getCell('C').value = day.project;
      row.getCell('D').value = 'Leave';
    } else {
      row.getCell('C').value = day.project;
      row.getCell('D').value = day.task;
    }

    row.getCell('E').value = day.time || '';
    row.getCell('E').alignment = { horizontal: 'center' };
    row.getCell('F').value = day.overtime || '';
    row.getCell('F').alignment = { horizontal: 'center' };
    row.getCell('G').value = day.totalTime || '';
    row.getCell('G').alignment = { horizontal: 'center' };

    // Apply row styling
    const bgColor = day.isHoliday ? HOLIDAY_BG
      : day.isLeave ? LEAVE_BG
      : day.isWeekend ? WEEKEND_BG
      : undefined;

    for (let col = 1; col <= 7; col++) {
      const cell = row.getCell(col);
      cell.border = thinBorder;
      cell.font = { size: 10 };

      if (bgColor) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      }
    }

    if (day.isHoliday) {
      row.getCell('D').font = { bold: true, color: { argb: HOLIDAY_RED }, size: 10 };
    } else if (day.isLeave) {
      row.getCell('D').font = { bold: true, size: 10 };
      row.getCell('D').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEAVE_YELLOW } };
    }

    rowNum++;
  }

  // --- Summary Rows ---
  const totalRow = sheet.getRow(rowNum);
  totalRow.getCell('A').value = 'Total Working Hours';
  totalRow.getCell('A').font = { bold: true, size: 10 };
  sheet.mergeCells(`A${rowNum}:D${rowNum}`);
  totalRow.getCell('E').value = data.totalHours;
  totalRow.getCell('E').alignment = { horizontal: 'center' };
  totalRow.getCell('F').value = data.totalOvertime;
  totalRow.getCell('F').alignment = { horizontal: 'center' };
  totalRow.getCell('G').value = data.totalHours + data.totalOvertime;
  totalRow.getCell('G').alignment = { horizontal: 'center' };
  for (let col = 1; col <= 7; col++) {
    const cell = totalRow.getCell(col);
    cell.border = thinBorder;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_HEADER } };
  }

  rowNum += 1;
  const holidayRow = sheet.getRow(rowNum);
  sheet.mergeCells(`A${rowNum}:F${rowNum}`);
  holidayRow.getCell('A').value = 'Holiday';
  holidayRow.getCell('A').font = { bold: true, size: 10 };
  holidayRow.getCell('A').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOLIDAY_BG } };
  holidayRow.getCell('G').value = data.holidayCount;
  holidayRow.getCell('G').alignment = { horizontal: 'center' };
  holidayRow.getCell('G').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOLIDAY_BG } };
  for (let col = 1; col <= 7; col++) {
    holidayRow.getCell(col).border = thinBorder;
  }

  rowNum += 1;
  const leaveRow = sheet.getRow(rowNum);
  sheet.mergeCells(`A${rowNum}:F${rowNum}`);
  leaveRow.getCell('A').value = 'Leave';
  leaveRow.getCell('A').font = { bold: true, size: 10 };
  leaveRow.getCell('A').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEAVE_BG } };
  leaveRow.getCell('G').value = data.leaveCount;
  leaveRow.getCell('G').alignment = { horizontal: 'center' };
  leaveRow.getCell('G').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEAVE_BG } };
  for (let col = 1; col <= 7; col++) {
    leaveRow.getCell(col).border = thinBorder;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
