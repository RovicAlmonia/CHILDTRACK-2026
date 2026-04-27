import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import pool from '../lib/db';
import { RowDataPacket } from 'mysql2';

console.log('[SF2] ✅ FINAL PIXEL STABLE TRIANGLE FIX LOADED');

/* ───────────────────────────────────────── */
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'sf2');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/* ───────────────────────────────────────── */
/* CONSTANTS */

const DATE_ROW = 11;
const DAY_ROW = 12;

const BOYS_START_ROW = 14;
const BOYS_END_ROW = 34;

const GIRLS_START_ROW = 36;
const GIRLS_END_ROW = 50;

const NAME_COLUMN = 2;
const FIRST_DAY_COLUMN = 4;
const ROW_HEIGHT = 22;

/* ───────────────────────────────────────── */
/* FILLS */

const RED_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFF0000' }
};

const GREEN_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF00B050' }
};

/* ───────────────────────────────────────── */
/* TRIANGLE FONT (BIGGER BUT SAFE INSIDE CELL) */

const TRIANGLE_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FF00B050' },
  size: 24, // 🔥 bigger but still safe (no overflow)
  bold: true
};

const AM_RICH: ExcelJS.CellRichTextValue = {
  richText: [{ text: '◤', font: TRIANGLE_FONT }]
};

const PM_RICH: ExcelJS.CellRichTextValue = {
  richText: [{ text: '◢', font: TRIANGLE_FONT }]
};

/* ───────────────────────────────────────── */
/* BASE CENTER */

const CENTER: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle'
};

/* ───────────────────────────────────────── */
/* HARD RESET (REMOVES RED GHOST FILL COMPLETELY) */

function hardReset(cell: ExcelJS.Cell) {
  const border = cell.border;

  cell.value = null;

  cell.style = {
    font: {},
    alignment: CENTER,
    border: border,
    numFmt: 'General',
    fill: {
      type: 'pattern',
      pattern: 'none'
    }
  } as any;

  cell.border = border;
}

/* ───────────────────────────────────────── */
/* V7 EXACT POSITIONING (RESTORED) */

const AM_ALIGN: Partial<ExcelJS.Alignment> = {
  horizontal: 'left',
  vertical: 'top',
  wrapText: false,
  shrinkToFit: false
};

const PM_ALIGN: Partial<ExcelJS.Alignment> = {
  horizontal: 'right',
  vertical: 'bottom',
  wrapText: false,
  shrinkToFit: false
};

/* ───────────────────────────────────────── */
/* TRIANGLE SETTERS (PIXEL STABLE + BIGGER SIZE) */

function setAM(cell: ExcelJS.Cell) {
  const border = cell.border;

  hardReset(cell);

  cell.value = AM_RICH;

  cell.alignment = AM_ALIGN;

  // ensure no inherited fill
  cell.fill = {
    type: 'pattern',
    pattern: 'none'
  } as any;

  cell.border = border;
}

function setPM(cell: ExcelJS.Cell) {
  const border = cell.border;

  hardReset(cell);

  cell.value = PM_RICH;

  cell.alignment = PM_ALIGN;

  // ensure no inherited fill
  cell.fill = {
    type: 'pattern',
    pattern: 'none'
  } as any;

  cell.border = border;
}

/* ───────────────────────────────────────── */
const daysInMonth = (m: number, y: number) =>
  new Date(y, m, 0).getDate();

/* ───────────────────────────────────────── */
export async function generateSF2(req: Request, res: Response) {

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Upload template file' });

  const month = Number(req.body.month);
  const year = Number(req.body.year);

  const totalDays = daysInMonth(month, year);

  /* ── FETCH DATA ── */
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT student_name, DATE_FORMAT(date,'%Y-%m-%d') as date, session, status
     FROM attendance
     WHERE MONTH(date)=? AND YEAR(date)=?`,
    [month, year]
  );

  const students = new Set<string>();
  const data: Record<string, any> = {};

  rows.forEach((r: any) => {

    const name = r.student_name;
    const day = Number(r.date.split('-')[2]);

    const session = (r.session || '').trim().toUpperCase();
    const status = (r.status || '').trim().toLowerCase();

    students.add(name);

    if (!data[name]) data[name] = {};
    if (!data[name][day]) data[name][day] = { am: false, pm: false };

    if (status !== 'absent') {
      if (session === 'AM') data[name][day].am = true;
      if (session === 'PM') data[name][day].pm = true;
    }
  });

  /* ── LOAD TEMPLATE ── */
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file.path);
  const ws = workbook.worksheets[0];

  /* ── MAP DAYS ── */
  const dayColumns: Record<number, number> = {};
  let col = FIRST_DAY_COLUMN;

  for (let d = 1; d <= totalDays; d++) {
    const wd = new Date(year, month - 1, d).getDay();

    if (wd >= 1 && wd <= 5) {
      dayColumns[d] = col;

      ws.getCell(DATE_ROW, col).value = d;
      ws.getCell(DAY_ROW, col).value =
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][wd - 1];

      col++;
    }
  }

  /* ── FILL FUNCTION ── */
  function fill(studentList: string[], startRow: number, endRow: number) {

    studentList.forEach((name, i) => {

      const row = startRow + i;
      if (row > endRow) return;

      ws.getRow(row).height = ROW_HEIGHT;
      ws.getCell(row, NAME_COLUMN).value = name;

      for (const [dStr, c] of Object.entries(dayColumns)) {

        const day = Number(dStr);
        const cell = ws.getCell(row, c);

        const flags = data[name]?.[day] || { am: false, pm: false };

        hardReset(cell);

        if (!flags.am && !flags.pm) {
          cell.fill = RED_FILL;

        } else if (flags.am && flags.pm) {
          cell.fill = GREEN_FILL;

        } else if (flags.am) {
          setAM(cell);

        } else if (flags.pm) {
          setPM(cell);
        }
      }
    });
  }

  const studentList = Array.from(students).sort();

  const half = Math.ceil(studentList.length / 2);
  const boys = studentList.slice(0, half);
  const girls = studentList.slice(half);

  fill(boys, BOYS_START_ROW, BOYS_END_ROW);
  fill(girls, GIRLS_START_ROW, GIRLS_END_ROW);

  /* ── SAVE FILE ── */
  const output = path.join(UPLOAD_DIR, `SF2_${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(output);

  return res.download(output);
}

/* ───────────────────────────────────────── */
export async function getSF2History(_req: Request, res: Response) {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM sf2_reports ORDER BY created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}