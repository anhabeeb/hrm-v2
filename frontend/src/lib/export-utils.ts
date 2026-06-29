export type ExportColumn = {
  key: string;
  label?: string;
};

export type ExportRow = Record<string, unknown>;

export type ExcelValidationRule = {
  columnKey: string;
  type: "list" | "date" | "decimal" | "whole" | "textLength";
  values?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  prompt?: string;
};

export type ExcelTemplateDefinition = {
  title: string;
  instructions: string[];
  columns: Array<ExportColumn & { required?: boolean; sample?: unknown; note?: string }>;
  validations?: ExcelValidationRule[];
  lookupGroups?: Record<string, string[]>;
};

const encoder = new TextEncoder();

export function friendlyColumnLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function exportFileName(moduleName: string, extension: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `hrm-v2-${moduleName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}.${extension}`;
}

export function normalizeExportColumns(columns: Array<string | ExportColumn>) {
  return columns.map((column) => typeof column === "string" ? { key: column, label: friendlyColumnLabel(column) } : { ...column, label: column.label ?? friendlyColumnLabel(column.key) });
}

export function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(columns: Array<string | ExportColumn>, rows: ExportRow[]) {
  const normalized = normalizeExportColumns(columns);
  return [
    normalized.map((column) => csvEscape(column.label)).join(","),
    ...rows.map((row) => normalized.map((column) => csvEscape(row[column.key])).join(","))
  ].join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnLetter(index: number) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function worksheetXml(rows: unknown[][], options: { validations?: ExcelValidationRule[]; lookupColumns?: Record<string, number>; hidden?: boolean } = {}) {
  const maxColumns = Math.max(...rows.map((row) => row.length), 1);
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnLetter(columnIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : "";
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${xml(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const cols = Array.from({ length: maxColumns }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="22" customWidth="1"/>`).join("");
  const dataValidations = buildWorksheetValidations(options.validations ?? [], options.lookupColumns ?? {});
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
  ${dataValidations}
</worksheet>`;
}

function buildWorksheetValidations(rules: ExcelValidationRule[], lookupColumns: Record<string, number>) {
  const rendered = rules.map((rule) => {
    const col = lookupColumns[rule.columnKey] ?? -1;
    if (col < 0) return "";
    const sqref = `${columnLetter(col)}2:${columnLetter(col)}1001`;
    const prompt = xml(`${rule.required ? "Required field. " : ""}${rule.prompt ?? ""}`.trim());
    if (rule.type === "list" && rule.values?.length) {
      const lookupColumn = columnLetter(Object.keys(lookupColumns).length + col);
      const inline = rule.values.join(",").length < 200 ? `"${xml(rule.values.join(","))}"` : null;
      return `<dataValidation type="list" allowBlank="${rule.required ? 0 : 1}" showInputMessage="1" showErrorMessage="1" sqref="${sqref}" promptTitle="Allowed values" prompt="${prompt || "Choose a value from the list."}"><formula1>${inline ?? `"${xml(rule.values.join(","))}"`}</formula1></dataValidation>`;
    }
    if (rule.type === "date") return `<dataValidation type="date" operator="greaterThanOrEqual" allowBlank="${rule.required ? 0 : 1}" showInputMessage="1" showErrorMessage="1" sqref="${sqref}" promptTitle="Date format" prompt="${prompt || "Use YYYY-MM-DD."}"><formula1>DATE(1900,1,1)</formula1></dataValidation>`;
    if (rule.type === "decimal" || rule.type === "whole") {
      const min = rule.min ?? 0;
      const max = rule.max ?? 999999999;
      return `<dataValidation type="${rule.type}" operator="between" allowBlank="${rule.required ? 0 : 1}" showInputMessage="1" showErrorMessage="1" sqref="${sqref}" promptTitle="Number" prompt="${prompt || "Enter a valid number."}"><formula1>${min}</formula1><formula2>${max}</formula2></dataValidation>`;
    }
    if (rule.type === "textLength") return `<dataValidation type="textLength" operator="between" allowBlank="${rule.required ? 0 : 1}" showInputMessage="1" showErrorMessage="1" sqref="${sqref}" promptTitle="Text" prompt="${prompt || "Enter text in the allowed length."}"><formula1>${rule.min ?? 0}</formula1><formula2>${rule.max ?? 255}</formula2></dataValidation>`;
    return "";
  }).filter(Boolean).join("");
  return rendered ? `<dataValidations count="${rules.length}">${rendered}</dataValidations>` : "";
}

function workbookXml(sheetNames: string[], hidden: Set<string>) {
  const sheets = sheetNames.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"${hidden.has(name) ? ' state="hidden"' : ""}/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRelsXml(sheetNames: string[]) {
  const sheetRels = sheetNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypesXml(sheetCount: number) {
  const sheets = Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

function crc32(data: Uint8Array) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function u16(value: number) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value: number) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function createZip(files: Array<{ name: string; content: string | Uint8Array }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(contentBytes);
    const local = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(contentBytes.length), u32(contentBytes.length), u16(nameBytes.length), u16(0), nameBytes, contentBytes]);
    localParts.push(local);
    centralParts.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(contentBytes.length), u32(contentBytes.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]));
    offset += local.length;
  }
  const central = concat(centralParts);
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]);
  return concat([...localParts, central, end]);
}

export function createXlsxBlob(title: string, columns: Array<string | ExportColumn>, rows: ExportRow[], metadata: string[] = []) {
  const normalized = normalizeExportColumns(columns);
  const templateRows = [normalized.map((column) => column.label), ...rows.map((row) => normalized.map((column) => row[column.key] ?? ""))];
  const instructions = [["Instructions"], ["Generated", new Date().toISOString()], ["Report", title], ...metadata.map((line) => [line])];
  const sheetNames = ["Report", "Instructions"];
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(sheetNames.length) },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: workbookXml(sheetNames, new Set()) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheetNames) },
    { name: "xl/styles.xml", content: stylesXml },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml(templateRows) },
    { name: "xl/worksheets/sheet2.xml", content: worksheetXml(instructions) }
  ];
  return new Blob([createZip(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function createTemplateXlsxBlob(definition: ExcelTemplateDefinition) {
  const headers = definition.columns.map((column) => `${column.label ?? friendlyColumnLabel(column.key)}${column.required ? " *" : ""}`);
  const sample = definition.columns.map((column) => column.sample ?? "");
  const lookupGroups = definition.lookupGroups ?? {};
  const lookupHeaders = Object.keys(lookupGroups);
  const lookupRows = [lookupHeaders];
  const maxLookupLength = Math.max(1, ...Object.values(lookupGroups).map((values) => values.length));
  for (let row = 0; row < maxLookupLength; row += 1) lookupRows.push(lookupHeaders.map((key) => lookupGroups[key]?.[row] ?? ""));
  const lookupColumns = Object.fromEntries(definition.columns.map((column, index) => [column.key, index]));
  const instructions = [["Instructions"], ...definition.instructions.map((line) => [line]), ["Generated", new Date().toISOString()]];
  const sheetNames = ["Instructions", "Template", "Lookups"];
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(sheetNames.length) },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: workbookXml(sheetNames, new Set(["Lookups"])) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheetNames) },
    { name: "xl/styles.xml", content: stylesXml },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml(instructions) },
    { name: "xl/worksheets/sheet2.xml", content: worksheetXml([headers, sample], { validations: definition.validations, lookupColumns }) },
    { name: "xl/worksheets/sheet3.xml", content: worksheetXml(lookupRows.length ? lookupRows : [["Lookup"], ["No lookup values available"]]) }
  ];
  return new Blob([createZip(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function createPdfBlob(title: string, columns: Array<string | ExportColumn>, rows: ExportRow[], metadata: string[] = []) {
  const normalized = normalizeExportColumns(columns);
  const lines = [
    title,
    `Generated: ${new Date().toISOString()}`,
    ...metadata,
    "",
    normalized.map((column) => column.label).join(" | "),
    ...rows.slice(0, 120).map((row) => normalized.map((column) => String(row[column.key] ?? "")).join(" | "))
  ];
  const content = lines.map((line, index) => `BT /F1 9 Tf 36 ${780 - index * 13} Td (${pdfText(line.slice(0, 120))}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: "application/pdf" });
}

function pdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "?");
}

export function exportRows(format: "csv" | "xlsx" | "pdf", moduleName: string, columns: Array<string | ExportColumn>, rows: ExportRow[], metadata: string[] = []) {
  if (format === "csv") {
    downloadBlob(new Blob([rowsToCsv(columns, rows)], { type: "text/csv;charset=utf-8" }), exportFileName(moduleName, "csv"));
    return;
  }
  if (format === "xlsx") {
    downloadBlob(createXlsxBlob(moduleName, columns, rows, metadata), exportFileName(moduleName, "xlsx"));
    return;
  }
  downloadBlob(createPdfBlob(moduleName, columns, rows, metadata), exportFileName(moduleName, "pdf"));
}
