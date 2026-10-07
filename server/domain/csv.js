// Pure CSV helpers. Cells starting with = + - @ (or tab/CR) get a leading ' to defuse spreadsheet formula injection.
const csvCell = (v) => {
  v = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
module.exports = { csvCell, toCsv };
