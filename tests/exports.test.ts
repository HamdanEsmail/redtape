// The exports: columns, quoting, the formula guard, the byte-order mark, and 409 when not ready.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CSV_COLUMNS, csvCell } from "../src/site/exports";
import { callWorker } from "./helpers/app";
import { clean, insertComparison, insertItem, readyComparison } from "./helpers/comparison";
import { fetchMock } from "./helpers/fetch-mock";

beforeEach(async () => {
  await clean();
  fetchMock.activate();
});
afterEach(() => fetchMock.reset());

/** Splits one CSV line, honouring quotes. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out;
}

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('He said "led", then left')).toBe('"He said ""led"", then left"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(-3)).toBe("-3");
  });

  it("keeps a formula as text for each leading character a spreadsheet would run", () => {
    expect(csvCell("=formula")).toBe("'=formula");
    expect(csvCell("+formula")).toBe("'+formula");
    expect(csvCell("-formula")).toBe("'-formula");
    expect(csvCell("@formula")).toBe("'@formula");
    expect(csvCell("\tformula")).toBe("'\tformula");
    expect(csvCell("\rformula")).toBe(`"'\rformula"`);
  });
});

describe("the comparison exports", () => {
  it("matches the API JSON, uses the CSV columns in order, quotes, guards formulas, and starts with a byte-order mark", async () => {
    const id = await readyComparison("exportready1");
    await insertItem({
      comparison_id: id,
      place_index: 0,
      category_n: 4,
      name: "Aldren tax number",
      fee: "=300",
      quote: 'He said "paid", then left',
      check_kind: "found",
    });

    const jsonRes = await callWorker(`/comparisons/${id}.json`);
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.headers.get("content-type")).toContain("application/json");
    expect(jsonRes.headers.get("content-disposition")).toContain("redtape-open-a-small-bakery.json");
    const json = await jsonRes.json();
    const api = await (await callWorker(`/api/comparisons/${id}`)).json();
    expect(json).toEqual(api);

    const csvRes = await callWorker(`/comparisons/${id}.csv`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("content-type")).toContain("text/csv");
    expect(csvRes.headers.get("content-disposition")).toContain("redtape-open-a-small-bakery.csv");
    const bytes = new Uint8Array(await csvRes.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder().decode(bytes.subarray(3));
    expect(body.endsWith("\r\n")).toBe(true);
    const lines = body.trimEnd().split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(CSV_COLUMNS).toEqual([
      "place",
      "category",
      "item",
      "required",
      "authority",
      "fee",
      "time",
      "renewal",
      "ongoing filings",
      "official URL",
      "quote",
      "check result",
      "checked at",
    ]);
    const rows = lines.slice(1).map(cells);
    const col = (r: string[], name: (typeof CSV_COLUMNS)[number]) => r[CSV_COLUMNS.indexOf(name)];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.length === CSV_COLUMNS.length)).toBe(true);
    const tax = rows.find((r) => col(r, "item") === "Aldren tax number")!;
    expect(col(tax, "fee")).toBe("'=300");
    expect(col(tax, "quote")).toBe('He said "paid", then left');
    expect(col(tax, "place")).toBe("Port Aldren");

    const apiCsv = await callWorker(`/api/comparisons/${id}.csv`);
    expect(await apiCsv.text()).toBe(body);
  });

  it("answers 409 with the state when the comparison is not ready", async () => {
    await insertComparison({ id: "queued000001", state: "queued" });
    const running = ["queued", "finding", "researching", "checking"];
    for (const path of [
      "/comparisons/queued000001.json",
      "/comparisons/queued000001.csv",
      "/api/comparisons/queued000001.csv",
    ]) {
      const res = await callWorker(path);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; state: string };
      expect(body.error).toBe("not_ready");
      expect(running).toContain(body.state);
    }
  });

  it("does not take .json or .csv as the comparison's page", async () => {
    const id = await readyComparison("routeready01");
    const json = await callWorker(`/comparisons/${id}.json`);
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toContain("application/json");
    const csv = await callWorker(`/comparisons/${id}.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const html = await callWorker(`/comparisons/${id}`);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
  });
});
