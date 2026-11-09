// The CSV export as a download. A UTF-8 byte-order mark starts the body so a spreadsheet reads accents.
import type { ComparisonView } from "../compare/read";
import { comparisonCsv, downloadName } from "./exports";

const BOM = "\uFEFF";

export function csvResponse(view: ComparisonView): Response {
  return new Response(`${BOM}${comparisonCsv(view)}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${downloadName(view.activity, "csv")}"`,
      "cache-control": "no-store",
    },
  });
}
