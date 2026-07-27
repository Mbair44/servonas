import ExcelJS from "exceljs";

export const EMPLOYEE_IMPORT_LIMITS = {
  bytes: 10 * 1024 * 1024,
  rows: 2_000,
  columns: 100,
  headerLength: 200,
  cellLength: 5_000,
} as const;

export type EmployeeImportPreview = {
  extension: "csv" | "xlsx";
  headers: string[];
  sourceColumns: {name:string; sampleValues:string[]}[];
  rowCount: number;
  rows: string[][];
};

export class EmployeeImportFileError extends Error {
  category:string;
  constructor(category:string, message:string) {
    super(message);
    this.category=category;
    this.name = "EmployeeImportFileError";
  }
}

function parseCsv(text:string) {
  const rows:string[][]=[]; let row:string[]=[]; let cell=""; let quoted=false;
  for(let index=0;index<text.length;index+=1){
    const character=text[index];
    if(quoted){
      if(character==='"'&&text[index+1]==='"'){cell+='"';index+=1;}
      else if(character==='"') quoted=false;
      else cell+=character;
    } else if(character==='"') quoted=true;
    else if(character===","){row.push(cell);cell="";}
    else if(character==="\n"){row.push(cell);rows.push(row);row=[];cell="";}
    else if(character!=="\r") cell+=character;
  }
  if(quoted) throw new EmployeeImportFileError("malformed","The CSV contains an unclosed quoted value.");
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}

function validateRows(rows:string[][], extension:"csv"|"xlsx"):EmployeeImportPreview {
  const nonEmpty=rows.filter(row=>row.some(cell=>cell.trim()));
  if(!nonEmpty.length) throw new EmployeeImportFileError("empty","The selected file is empty.");
  const headers=nonEmpty[0].map(header=>header.trim());
  if(!headers.length||headers.every(header=>!header)) throw new EmployeeImportFileError("missing_headers","Add a header row before uploading the file.");
  if(headers.length>EMPLOYEE_IMPORT_LIMITS.columns) throw new EmployeeImportFileError("too_many_columns",`Files may contain no more than ${EMPLOYEE_IMPORT_LIMITS.columns} columns.`);
  if(headers.some(header=>!header)) throw new EmployeeImportFileError("missing_headers","Every populated column needs a header.");
  if(headers.some(header=>header.length>EMPLOYEE_IMPORT_LIMITS.headerLength)) throw new EmployeeImportFileError("header_too_long","A column header is too long.");
  const normalized=headers.map(header=>header.toLocaleLowerCase());
  if(new Set(normalized).size!==normalized.length) throw new EmployeeImportFileError("duplicate_headers","Column headers must be unique.");
  let dataRows=nonEmpty.slice(1);
  if(dataRows[0]?.[0]?.trim().toUpperCase()==="EXAMPLE - DO NOT IMPORT") dataRows=dataRows.slice(1);
  if(dataRows.length>EMPLOYEE_IMPORT_LIMITS.rows) throw new EmployeeImportFileError("too_many_rows",`Files may contain no more than ${EMPLOYEE_IMPORT_LIMITS.rows.toLocaleString()} employee rows.`);
  for(const row of dataRows){
    if(row.length>headers.length&&row.slice(headers.length).some(cell=>cell.trim())) throw new EmployeeImportFileError("extra_columns","A row contains values beyond the header columns.");
    if(row.some(cell=>cell.length>EMPLOYEE_IMPORT_LIMITS.cellLength)) throw new EmployeeImportFileError("cell_too_long","A cell exceeds the 5,000 character safety limit.");
  }
  return {
    extension,
    headers,
    rowCount:dataRows.length,
    rows:dataRows.map(row=>headers.map((_,index)=>row[index]?.trim()??"")),
    sourceColumns:headers.map((name,index)=>({name,sampleValues:dataRows.map(row=>row[index]?.trim()??"").filter(Boolean).slice(0,3)})),
  };
}

export async function parseEmployeeImportFile(file:File):Promise<EmployeeImportPreview>{
  if(file.size>EMPLOYEE_IMPORT_LIMITS.bytes) throw new EmployeeImportFileError("file_too_large","Choose a file smaller than 10 MB.");
  const extension=file.name.split(".").pop()?.toLowerCase();
  if(extension!=="csv"&&extension!=="xlsx") throw new EmployeeImportFileError("unsupported_type","Upload a .csv or .xlsx file.");
  const allowedMime=extension==="csv"
    ? new Set(["","text/csv","application/csv","application/vnd.ms-excel","text/plain"])
    : new Set(["","application/octet-stream","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
  if(!allowedMime.has(file.type.toLowerCase())) throw new EmployeeImportFileError("mime_mismatch","The file contents do not match the selected file type.");
  const buffer=Buffer.from(await file.arrayBuffer());
  if(extension==="csv"){
    const text=new TextDecoder("utf-8",{fatal:true}).decode(buffer).replace(/^\uFEFF/,"");
    return validateRows(parseCsv(text),"csv");
  }
  try{
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const visible=workbook.worksheets.filter(sheet=>sheet.state==="visible"&&sheet.actualRowCount>0);
    if(!visible.length) throw new EmployeeImportFileError("empty","The workbook has no visible worksheet data.");
    if(visible.length>1) throw new EmployeeImportFileError("multiple_sheets","Keep employee data on one visible worksheet before uploading.");
    const sheet=visible[0]; const rows:string[][]=[];
    sheet.eachRow({includeEmpty:false},row=>{
      const values:string[]=[];
      for(let index=1;index<=row.cellCount;index+=1){
        const cell=row.getCell(index);
        const raw=cell.value;
        if(raw&&typeof raw==="object"&&("formula" in raw||"sharedFormula" in raw)) throw new EmployeeImportFileError("formula","Remove formulas and upload values only.");
        values.push(cell.text);
      }
      rows.push(values);
    });
    return validateRows(rows,"xlsx");
  }catch(error){
    if(error instanceof EmployeeImportFileError) throw error;
    throw new EmployeeImportFileError("malformed","The Excel file could not be read. Password-protected or damaged workbooks are not supported.");
  }
}
