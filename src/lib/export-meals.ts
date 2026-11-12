export function csvCell(value:unknown):string {
  const text=String(value??"");
  // Spreadsheet tools may evaluate cells beginning with formula operators, even when quoted.
  // Preserve data while forcing spreadsheet-text interpretation.
  const safe = /^[\t\r\n ]*[=+@-]/.test(text) ? "'"+text : text;
  return '"'+safe.replace(/"/g,'""')+'"';
}
export function mealsToCsv(rows:Array<Record<string,unknown>>):string {
  const columns=["meal_date","meal_type","food_name","serving_description","calories",
    "protein","carbs","fat","is_planned","portion_percentage","created_at"];
  const header=columns.map(csvCell).join(",");
  return [header,...rows.map(row=>columns.map(col=>csvCell(row[col])).join(","))].join("\r\n");
}
