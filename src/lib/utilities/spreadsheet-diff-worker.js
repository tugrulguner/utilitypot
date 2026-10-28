import { parseCsv, tableFromRows, compareTables } from "./spreadsheet-diff.js";
import { readXlsx } from "./xlsx-reader.js";
self.onmessage = async ({ data }) => {
  try {
    let result;
    if (data.kind === "file") {
      const file = data.file;
      if (
        !(file instanceof Blob) ||
        file.size > (data.format === "xlsx" ? 5 : 2) * 1024 * 1024
      )
        throw new Error("File exceeds its resource limit.");
      const bytes = await file.arrayBuffer();
      data =
        data.format === "xlsx"
          ? { kind: "xlsx", bytes }
          : {
              kind: "csv",
              text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            };
    }
    if (data.kind === "csv")
      result = {
        sheets: [{ name: "CSV", table: parseCsv(data.text) }],
        text: data.text,
      };
    else if (data.kind === "xlsx") {
      const book = await readXlsx(new Uint8Array(data.bytes));
      result = {
        sheets: book.sheets.map((sheet) => {
          try {
            return { name: sheet.name, table: tableFromRows(sheet.rows) };
          } catch {
            return {
              name: sheet.name,
              error:
                "This sheet needs a nonblank, unique first-row header and bounded rectangular data.",
            };
          }
        }),
      };
    } else if (data.kind === "compare")
      result = compareTables(data.before, data.after, data.key);
    else throw new Error("Unsupported local operation.");
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Could not process the input.",
    });
  }
};
