import "server-only";

/**
 * Builds a yearly XLSX archive from an array of accepted MealPlan objects.
 *
 * Uses JSZip (already in package.json) to assemble the Open XML workbook
 * without requiring exceljs or any other heavy XLSX library.
 *
 * The XLSX format is a ZIP containing SpreadsheetML XML files. Each cell uses
 * the inline-string type (t="inlineStr") so no shared-strings table is needed.
 */

import JSZip from "jszip";
import {
  type MealPlan,
  type Day,
} from "@/lib/tracker/meal-planner-plan";

// ─── Column helpers ──────────────────────────────────────────────────────────

/** Convert a 1-based column index to its Excel letter. Valid range: 1-26 (A-Z). */
function colLetter(n: number): string {
  return String.fromCharCode(64 + n);
}

/** Excel cell address, e.g. colLetter(1) + "1" → "A1". */
function cellAddr(col: number, row: number): string {
  return `${colLetter(col)}${row}`;
}

// ─── XML escaping ────────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── SpreadsheetML builders ──────────────────────────────────────────────────

const COLUMNS = [
  "Week",
  "Day",
  "Meal Name",
  "Cuisine",
  "Calories",
  "Protein(g)",
  "Carbs(g)",
  "Fat(g)",
  "Fiber(g)",
  "Ingredients",
  "Storage",
  "Reheat",
] as const;

type RowValues = [
  string, // Week
  string, // Day
  string, // Meal Name
  string, // Cuisine
  string, // Calories  — kept as string; inline strings only
  string, // Protein(g)
  string, // Carbs(g)
  string, // Fat(g)
  string, // Fiber(g)
  string, // Ingredients
  string, // Storage
  string, // Reheat
];

function inlineStringCell(col: number, row: number, value: string): string {
  return `<c r="${cellAddr(col, row)}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function buildSheetXml(rows: RowValues[]): string {
  const header = COLUMNS.map((title, idx) =>
    inlineStringCell(idx + 1, 1, title),
  ).join("");

  const dataRows = rows
    .map((row, rowIdx) => {
      const rowNum = rowIdx + 2; // 1-indexed, row 1 is header
      const cells = row
        .map((val, colIdx) => inlineStringCell(colIdx + 1, rowNum, val))
        .join("");
      return `<row r="${rowNum}">${cells}</row>`;
    })
    .join("\n    ");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n` +
    `  <sheetData>\n` +
    `    <row r="1">${header}</row>\n` +
    `    ${dataRows}\n` +
    `  </sheetData>\n` +
    `</worksheet>`
  );
}

function buildContentTypesXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
    `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
    `  <Default Extension="xml" ContentType="application/xml"/>\n` +
    `  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n` +
    `  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n` +
    `</Types>`
  );
}

function buildRootRelsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
    `  <Relationship Id="rId1"\n` +
    `    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"\n` +
    `    Target="xl/workbook.xml"/>\n` +
    `</Relationships>`
  );
}

function buildWorkbookXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"\n` +
    `          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n` +
    `  <sheets>\n` +
    `    <sheet name="Meals" sheetId="1" r:id="rId1"/>\n` +
    `  </sheets>\n` +
    `</workbook>`
  );
}

function buildWorkbookRelsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
    `  <Relationship Id="rId1"\n` +
    `    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"\n` +
    `    Target="worksheets/sheet1.xml"/>\n` +
    `</Relationships>`
  );
}

// ─── Day sort order ──────────────────────────────────────────────────────────

const DAY_OFFSETS: Record<Day, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a valid `.xlsx` Uint8Array from an array of accepted MealPlan objects.
 *
 * Columns: Week, Day, Meal Name, Cuisine, Calories, Protein(g), Carbs(g),
 *          Fat(g), Fiber(g), Ingredients, Storage, Reheat.
 *
 * Plans are sorted by weekId then by day within the week.
 */
export async function buildYearlyArchiveXlsx(plans: MealPlan[]): Promise<Uint8Array> {
  // Sort plans by weekId (lexicographic ISO week sort works correctly)
  const sortedPlans = [...plans].sort((a, b) =>
    a.weekId < b.weekId ? -1 : a.weekId > b.weekId ? 1 : 0,
  );

  const rows: RowValues[] = [];

  for (const plan of sortedPlans) {
    // Sort meals within the week by day offset
    const sortedMeals = [...plan.meals].sort(
      (a, b) => (DAY_OFFSETS[a.day] ?? 0) - (DAY_OFFSETS[b.day] ?? 0),
    );

    for (const meal of sortedMeals) {
      const ingredientStr = meal.ingredients
        .map((i) => [i.qty, i.unit, i.name].filter(Boolean).join(" ").trim())
        .join("; ");

      rows.push([
        plan.weekId,
        meal.day,
        meal.name,
        meal.cuisine,
        String(meal.calories),
        String(meal.macros.protein_g),
        String(meal.macros.carbs_g),
        String(meal.macros.fat_g),
        String(meal.macros.fiber_g),
        ingredientStr,
        meal.storage ?? "",
        meal.reheat ?? "",
      ]);
    }
  }

  const zip = new JSZip();

  zip.file("[Content_Types].xml", buildContentTypesXml());
  zip.folder("_rels")!.file(".rels", buildRootRelsXml());

  const xl = zip.folder("xl")!;
  xl.file("workbook.xml", buildWorkbookXml());
  xl.folder("_rels")!.file("workbook.xml.rels", buildWorkbookRelsXml());
  xl.folder("worksheets")!.file("sheet1.xml", buildSheetXml(rows));

  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return buffer;
}
