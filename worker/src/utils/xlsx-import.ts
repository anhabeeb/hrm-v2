export type ParsedSpreadsheet = {
  sheetName: string;
  rows: string[][];
};

const decoder = new TextDecoder();

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(input: string) {
  const attrs: Record<string, string> = {};
  for (const match of input.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function columnIndexFromReference(reference: string) {
  const letters = (reference.match(/[A-Z]+/i)?.[0] ?? "").toUpperCase();
  let value = 0;
  for (const letter of letters) value = value * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, value - 1);
}

async function inflateRaw(data: Uint8Array) {
  const streamCtor = globalThis.DecompressionStream as unknown as undefined | (new (format: string) => DecompressionStream);
  if (!streamCtor) throw new Error("XLSX_DECOMPRESSION_UNAVAILABLE");
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new streamCtor("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipXlsxEntries(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 66000); offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("XLSX_ZIP_DIRECTORY_NOT_FOUND");
  const entryCount = readU16(bytes, eocd + 10);
  let centralOffset = readU32(bytes, eocd + 16);
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(bytes, centralOffset) !== 0x02014b50) throw new Error("XLSX_ZIP_DIRECTORY_INVALID");
    const method = readU16(bytes, centralOffset + 10);
    const compressedSize = readU32(bytes, centralOffset + 20);
    const nameLength = readU16(bytes, centralOffset + 28);
    const extraLength = readU16(bytes, centralOffset + 30);
    const commentLength = readU16(bytes, centralOffset + 32);
    const localOffset = readU32(bytes, centralOffset + 42);
    const name = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength));
    if (!name.endsWith("/")) {
      if (readU32(bytes, localOffset) !== 0x04034b50) throw new Error("XLSX_ZIP_LOCAL_HEADER_INVALID");
      const localNameLength = readU16(bytes, localOffset + 26);
      const localExtraLength = readU16(bytes, localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      if (method === 0) entries.set(name, compressed);
      else if (method === 8) entries.set(name, await inflateRaw(compressed));
      else throw new Error(`XLSX_UNSUPPORTED_COMPRESSION_${method}`);
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntryText(entries: Map<string, Uint8Array>, name: string) {
  const entry = entries.get(name);
  return entry ? decoder.decode(entry) : "";
}

function readSharedStrings(xml: string) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((text) => decodeXml(text[1])).join(""));
}

function readWorkbookRelationships(xml: string) {
  const rels = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseAttributes(match[1]);
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, attrs.Target);
  }
  return rels;
}

function resolveWorkbookTarget(target: string) {
  if (target.startsWith("/")) return target.slice(1);
  if (target.startsWith("xl/")) return target;
  return `xl/${target.replace(/^\.\//, "")}`;
}

function readWorkbookSheets(workbookXml: string, relsXml: string) {
  const relationships = readWorkbookRelationships(relsXml);
  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = parseAttributes(match[1]);
    const id = attrs["r:id"];
    const target = id ? relationships.get(id) : null;
    if (attrs.name && target) sheets.push({ name: attrs.name, path: resolveWorkbookTarget(target) });
  }
  return sheets;
}

function readCellValue(cellAttrs: Record<string, string>, cellBody: string, sharedStrings: string[]) {
  if (cellAttrs.t === "s") {
    const index = Number(cellBody.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "");
    return Number.isFinite(index) ? sharedStrings[index] ?? "" : "";
  }
  if (cellAttrs.t === "inlineStr") {
    return [...cellBody.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
  }
  const value = cellBody.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
  return decodeXml(value);
}

function readWorksheetRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = parseAttributes(rowMatch[1]);
    const rowIndex = Number(rowAttrs.r || rows.length + 1) - 1;
    const row: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const cellAttrs = parseAttributes(cellMatch[1]);
      const columnIndex = columnIndexFromReference(cellAttrs.r ?? "");
      row[columnIndex] = readCellValue(cellAttrs, cellMatch[2], sharedStrings);
    }
    rows[rowIndex] = row.map((value) => value ?? "");
  }
  return rows;
}

export async function parseXlsxTemplateSheet(file: File): Promise<ParsedSpreadsheet> {
  const entries = await unzipXlsxEntries(await file.arrayBuffer());
  const workbookXml = readEntryText(entries, "xl/workbook.xml");
  const relsXml = readEntryText(entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) throw new Error("XLSX_WORKBOOK_NOT_FOUND");
  const sheets = readWorkbookSheets(workbookXml, relsXml);
  const sheet = sheets.find((item) => item.name.trim().toLowerCase() === "template") ?? sheets[0];
  if (!sheet) throw new Error("XLSX_TEMPLATE_SHEET_NOT_FOUND");
  const worksheetXml = readEntryText(entries, sheet.path);
  if (!worksheetXml) throw new Error("XLSX_WORKSHEET_NOT_FOUND");
  const sharedStrings = readSharedStrings(readEntryText(entries, "xl/sharedStrings.xml"));
  const rows = readWorksheetRows(worksheetXml, sharedStrings).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  return { sheetName: sheet.name, rows };
}
