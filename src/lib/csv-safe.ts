/**
 * WP-B2 — CSV formula-injection safety.
 *
 * A spreadsheet treats a cell whose first character is one of `= + - @` (or a
 * leading Tab / CR) as a FORMULA the moment the file is opened. So a member name
 * smuggled through a bulk import as `=HYPERLINK("http://evil","click")` or
 * `+cmd|'/c calc'!A1` becomes live code in whoever later opens the exported CSV.
 * The fix is symmetric: neutralize on the way IN (bulk import) and on the way OUT
 * (every CSV export) so no instance of the class survives either boundary.
 *
 * Neutralization prefixes the value with a single quote — every spreadsheet
 * renders `'` as literal text and never evaluates the cell. It is idempotent: a
 * value that already starts with `'` is left alone.
 *
 * SIGNED NUMBERS ARE NOT FORMULAS. `-500.25`, `+256`, `256700123456` are
 * legitimate data (Excel/Sheets evaluate a leading `+`/`-` on an otherwise-plain
 * number to the number itself, with no function call or cell reference), so they
 * are deliberately left untouched — mangling them would corrupt every monetary,
 * balance and phone column in the reports export. Only a `+`/`-` lead that is
 * NOT a plain number (e.g. `+cmd|…`, `-2+3`, `=1`) is neutralized.
 *
 * This module is pure (no server-only imports) so it is safe to import from both
 * server actions and client components.
 */

/** First character that can start a spreadsheet formula (or a control-char lead). */
const FORMULA_LEAD = /^[=+\-@\t\r]/;
/** An optionally-signed plain decimal — legitimate data, never a formula. */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Defang a single value against CSV formula injection WITHOUT any CSV quoting.
 * Use this when the value is stored/rendered as data (e.g. a member name on
 * import). Returns the value unchanged when it cannot trigger a formula.
 */
export function neutralizeFormula(value: string): string {
  if (!value) return value;
  if (!FORMULA_LEAD.test(value)) return value;
  const lead = value[0];
  // A leading +/- on a plain number is a signed number, not a formula.
  if ((lead === "+" || lead === "-") && PLAIN_NUMBER.test(value.trim())) return value;
  return `'${value}`;
}

/**
 * Neutralize a value AND RFC-4180-quote it for CSV output: wrap in double quotes
 * (escaping embedded quotes) when it contains a comma, quote, CR or LF. Every
 * cell written to a CSV export must pass through this.
 */
export function csvSafeCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const safe = neutralizeFormula(raw);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** A single CSV line — every cell neutralized + quoted. */
export function toCsvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvSafeCell).join(",");
}

/** A complete CSV document (CRLF line endings), header + rows, all cells safe. */
export function buildCsv(
  headers: Array<string | number | null | undefined>,
  rows: Array<Array<string | number | null | undefined>>,
): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join("\r\n");
}
