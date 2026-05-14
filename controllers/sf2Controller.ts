import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import pool from '../lib/db';
import { RowDataPacket } from 'mysql2';

console.log('[SF2] ✅ v13 — Latest record wins, all status contingencies handled');

/* ─────────────────────────────────────────────────────────────────── */
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'sf2');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/* ─────────────────────────────────────────────────────────────────── */
const DATE_ROW         = 11;
const DAY_ROW          = 12;
const BOYS_START_ROW   = 14;
const BOYS_END_ROW     = 34;
const GIRLS_START_ROW  = 36;
const GIRLS_END_ROW    = 60;
const NAME_COLUMN      = 2;
const FIRST_DAY_COLUMN = 4;
const ROW_HEIGHT       = 22;

const GREEN = 'FF00B050';
const RED   = 'FFFF0000';

/* ─────────────────────────────────────────────────────────────────── */
const FULL_GREEN_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN },
};
const RED_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: RED },
};
const NO_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'none',
} as ExcelJS.Fill;

/* ─────────────────────────────────────────────────────────────────── */
interface CellPos { col: number; row: number; }

/* ─────────────────────────────────────────────────────────────────── */
/**
 * Returns true if the status counts as attended (present for that session).
 * Handles all known variants: Present, Late, Drop-off, DROP-OFF, Pick-up,
 * PICK-UP, Early departure, etc.
 * Only Absent / Dropped-out count as not attended.
 */
function isAttended(status: string): boolean {
  const s = (status || '').toLowerCase().replace(/[-_\s]/g, '');
  if (s === 'absent')     return false;
  if (s === 'droppedout') return false;
  return true;
}

/* ─────────────────────────────────────────────────────────────────── */
function hardReset(cell: ExcelJS.Cell) {
  const b = (cell.border || {}) as any;
  const outerBorder = {
    top: b.top, left: b.left, bottom: b.bottom, right: b.right,
  };
  cell.value = null;
  cell.style = {
    font:      { name: 'Arial Narrow', size: 11 },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border:    outerBorder as ExcelJS.Borders,
    numFmt:    'General',
    fill:      NO_FILL,
  };
  cell.border = outerBorder as ExcelJS.Borders;
}

/* ─────────────────────────────────────────────────────────────────── */
/**
 * Builds xl/drawings/drawing1.xml.
 * AM  → rtTriangle flipV="1"  → right-angle at TOP-LEFT
 * PM  → rtTriangle flipH="1"  → right-angle at BOTTOM-RIGHT
 * twoCellAnchor colOff/rowOff = 0 → flush to inner cell edge, no padding.
 */
function buildDrawingXml(amCells: CellPos[], pmCells: CellPos[]): string {
  let shapeId = 100;
  const shapes: string[] = [];

  const makeShape = (pos: CellPos, isAM: boolean, id: number): string => {
    const flipAttr = isAM ? 'flipV="1"' : 'flipH="1"';
    return `  <xdr:twoCellAnchor editAs="absolute">
    <xdr:from>
      <xdr:col>${pos.col}</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>${pos.row}</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>${pos.col + 1}</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>${pos.row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:sp macro="" textlink="">
      <xdr:nvSpPr>
        <xdr:cNvPr id="${id}" name="${isAM ? 'AM' : 'PM'}_c${pos.col}_r${pos.row}"/>
        <xdr:cNvSpPr><a:spLocks noGrp="1"/></xdr:cNvSpPr>
      </xdr:nvSpPr>
      <xdr:spPr>
        <a:xfrm ${flipAttr}>
          <a:off x="0" y="0"/>
          <a:ext cx="100" cy="100"/>
        </a:xfrm>
        <a:prstGeom prst="rtTriangle"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="00B050"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </xdr:spPr>
      <xdr:style>
        <a:lnRef idx="0"><a:schemeClr clr="accent1"/></a:lnRef>
        <a:fillRef idx="0"><a:schemeClr clr="accent1"/></a:fillRef>
        <a:effectRef idx="0"><a:schemeClr clr="accent1"/></a:effectRef>
        <a:fontRef idx="minor"><a:schemeClr clr="lt1"/></a:fontRef>
      </xdr:style>
      <xdr:txBody><a:bodyPr/><a:lstStyle/><a:p/></xdr:txBody>
    </xdr:sp>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`;
  };

  for (const pos of amCells) shapes.push(makeShape(pos, true,  shapeId++));
  for (const pos of pmCells) shapes.push(makeShape(pos, false, shapeId++));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${shapes.join('\n')}
</xdr:wsDr>`;
}

/* ─────────────────────────────────────────────────────────────────── */
/**
 * Post-processes the saved xlsx with JSZip to inject DrawingML triangle
 * shapes. Overwrites the file in place.
 */
async function patchDrawings(
  filePath: string,
  amCells: CellPos[],
  pmCells: CellPos[],
): Promise<void> {
  if (amCells.length === 0 && pmCells.length === 0) return;

  const buf     = fs.readFileSync(filePath);
  const zip     = await JSZip.loadAsync(buf);
  const allKeys = Object.keys(zip.files);

  /* ── find the first worksheet file ── */
  const sheetKey = allKeys.find(k => /xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetKey) throw new Error('Could not find worksheet in xlsx');

  const sheetXml = await zip.file(sheetKey)!.async('string');

  /* ── find or create worksheet rels ── */
  const sheetName    = path.basename(sheetKey);
  const relsKey      = `xl/worksheets/_rels/${sheetName}.rels`;
  const drawingRelId = 'rId_drawing1';

  let relsXml = zip.file(relsKey)
    ? await zip.file(relsKey)!.async('string')
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  /* ── inject drawing relationship if not already present ── */
  if (!relsXml.includes('drawing')) {
    relsXml = relsXml.replace(
      '</Relationships>',
      `  <Relationship Id="${drawingRelId}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" ` +
      `Target="../drawings/drawing1.xml"/>\n</Relationships>`,
    );
  }

  /* ── inject <drawing r:id="..."/> into sheet XML before </worksheet> ── */
  let newSheetXml = sheetXml;
  if (!newSheetXml.includes('<drawing')) {
    newSheetXml = newSheetXml.replace(
      '</worksheet>',
      `<drawing r:id="${drawingRelId}"/></worksheet>`,
    );
    if (!newSheetXml.includes('xmlns:r=')) {
      newSheetXml = newSheetXml.replace(
        '<worksheet ',
        '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
      );
    }
  }

  /* ── build drawing XML ── */
  const drawingXml = buildDrawingXml(amCells, pmCells);

  /* ── update [Content_Types].xml ── */
  let ctXml = await zip.file('[Content_Types].xml')!.async('string');
  if (!ctXml.includes('drawing1.xml')) {
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/xl/drawings/drawing1.xml" ` +
      `ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>`,
    );
  }

  /* ── write back ── */
  zip.file(sheetKey,                   newSheetXml);
  zip.file(relsKey,                    relsXml);
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  zip.file('[Content_Types].xml',      ctXml);

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(filePath, out);
}

/* ─────────────────────────────────────────────────────────────────── */
const daysInMonth = (m: number, y: number) => new Date(y, m, 0).getDate();

/* ─────────────────────────────────────────────────────────────────── */
export async function generateSF2(req: Request, res: Response) {

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Upload template file' });

  const month     = Number(req.body.month);
  const year      = Number(req.body.year);
  const totalDays = daysInMonth(month, year);

  /* ── validate inputs ── */
  if (isNaN(month) || month < 1 || month > 12)
    return res.status(400).json({ error: 'Invalid month' });
  if (isNaN(year) || year < 2000 || year > 2100)
    return res.status(400).json({ error: 'Invalid year' });

  /* ── FETCH — ORDER BY id ASC so latest duplicate record wins ── */
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT student_name,
            gender,
            DATE_FORMAT(date, '%Y-%m-%d') AS date,
            session,
            status
     FROM attendance
     WHERE MONTH(date) = ? AND YEAR(date) = ?
     ORDER BY id ASC`,
    [month, year],
  );

  /* ── BUILD META ── */
  const studentMeta: Record<string, {
    gender: string;
    days: Record<number, { am: boolean; pm: boolean }>;
  }> = {};

  rows.forEach((r: any) => {
    const name    = (r.student_name || '').trim();
    const gender  = (r.gender       || '').trim().toUpperCase();
    const day     = Number((r.date  as string).split('-')[2]);
    const session = (r.session      || '').trim().toUpperCase();

    /* ── skip malformed rows ── */
    if (!name || isNaN(day) || day < 1 || day > 31) return;

    if (!studentMeta[name])
      studentMeta[name] = { gender, days: {} };

    /* keep first non-empty gender found */
    if (!studentMeta[name].gender && gender)
      studentMeta[name].gender = gender;

    if (!studentMeta[name].days[day])
      studentMeta[name].days[day] = { am: false, pm: false };

    const attended = isAttended(r.status);

    /*
     * FIX: always overwrite (not just set to true).
     * Since ORDER BY id ASC, the highest id (latest record) wins.
     * This correctly handles corrections like:
     *   row 21: Drop-off AM  → am = true
     *   row 29: Absent  AM  → am = false  ← now correctly overrides
     */
    if (session === 'AM') {
      studentMeta[name].days[day].am = attended;
    } else if (session === 'PM') {
      studentMeta[name].days[day].pm = attended;
    } else if (session === 'FULL') {
      studentMeta[name].days[day].am = attended;
      studentMeta[name].days[day].pm = attended;
    }
    /* unknown session values are silently ignored */
  });

  /* ── GENDER SPLIT ── */
  const boys:  string[] = [];
  const girls: string[] = [];
  const other: string[] = [];

  Object.entries(studentMeta)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, meta]) => {
      if      (meta.gender === 'M') boys.push(name);
      else if (meta.gender === 'F') girls.push(name);
      else                          other.push(name);   // unknown gender → appended to boys section
    });

  boys.push(...other);

  /* ── LOAD TEMPLATE ── */
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file.path);

  if (!workbook.worksheets.length)
    return res.status(400).json({ error: 'Template has no worksheets' });

  const ws = workbook.worksheets[0];

  /* ── MAP WEEKDAY COLUMNS (skip weekends) ── */
  const dayColumns: Record<number, number> = {};   // day-of-month → 1-indexed col
  let col = FIRST_DAY_COLUMN;

  for (let d = 1; d <= totalDays; d++) {
    const wd = new Date(year, month - 1, d).getDay();
    if (wd >= 1 && wd <= 5) {                        // Mon–Fri only
      dayColumns[d] = col;
      ws.getCell(DATE_ROW, col).value = d;
      ws.getCell(DAY_ROW,  col).value =
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][wd - 1];
      col++;
    }
  }

  /* ── Triangle cell position collectors (0-indexed for DrawingML) ── */
  const amCells: CellPos[] = [];
  const pmCells: CellPos[] = [];

  /* ── FILL SECTION ── */
  function fillSection(list: string[], startRow: number, endRow: number) {
    list.forEach((name, i) => {
      const row = startRow + i;
      if (row > endRow) return;   // overflow guard — more students than rows

      ws.getRow(row).height = ROW_HEIGHT;
      ws.getCell(row, NAME_COLUMN).value = name;

      for (const [dStr, c] of Object.entries(dayColumns)) {
        const day   = Number(dStr);
        const cell  = ws.getCell(row, c);
        const flags = studentMeta[name]?.days[day] ?? { am: false, pm: false };

        hardReset(cell);

        if (flags.am && flags.pm) {
          /* ── both sessions attended → solid green ── */
          cell.fill = FULL_GREEN_FILL;

        } else if (flags.am) {
          /* ── AM only → white cell, green triangle injected via DrawingML ── */
          cell.fill = NO_FILL;
          amCells.push({ col: c - 1, row: row - 1 });

        } else if (flags.pm) {
          /* ── PM only → white cell, green triangle injected via DrawingML ── */
          cell.fill = NO_FILL;
          pmCells.push({ col: c - 1, row: row - 1 });

        } else {
          /* ── absent (both sessions) → red ── */
          cell.fill = RED_FILL;
        }
      }
    });
  }

  fillSection(boys,  BOYS_START_ROW,  BOYS_END_ROW);
  fillSection(girls, GIRLS_START_ROW, GIRLS_END_ROW);

  /* ── SAVE base xlsx ── */
  const output = path.join(UPLOAD_DIR, `SF2_${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(output);

  /* ── PATCH: inject DrawingML right-triangle shapes for AM/PM cells ── */
  await patchDrawings(output, amCells, pmCells);

  return res.download(output, (err) => {
    if (err) {
      console.error('[SF2] Download error:', err);
      if (!res.headersSent)
        res.status(500).json({ error: 'Failed to send file' });
    }
  });
}

/* ─────────────────────────────────────────────────────────────────── */
export async function getSF2History(_req: Request, res: Response) {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM sf2_reports ORDER BY created_at DESC LIMIT 50`,
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}