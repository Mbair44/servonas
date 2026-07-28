import ExcelJS from "exceljs";

export const CUSTOMER_IMPORT_LIMITS={bytes:25*1024*1024,rows:25_000,columns:150,headerLength:200,cellLength:5_000} as const;
export type WorksheetSummary={name:string;state:"visible"|"hidden"|"veryHidden";rowCount:number};
export type CustomerImportPreview={extension:"csv"|"xlsx";worksheetName:string|null;worksheets:WorksheetSummary[];headers:string[];sourceColumns:{name:string;sampleValues:string[]}[];rowCount:number;rows:string[][]};
export class CustomerImportFileError extends Error{constructor(public category:string,message:string){super(message);this.name="CustomerImportFileError";}}

function parseCsv(text:string){
 const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
 for(let index=0;index<text.length;index+=1){const character=text[index];
  if(quoted){if(character==='"'&&text[index+1]==='"'){cell+='"';index+=1;}else if(character==='"')quoted=false;else cell+=character;}
  else if(character==='"')quoted=true;else if(character===","){row.push(cell);cell="";}else if(character==="\n"){row.push(cell);rows.push(row);row=[];cell="";}else if(character!=="\r")cell+=character;
 }
 if(quoted)throw new CustomerImportFileError("malformed","The CSV contains an unclosed quoted value.");
 if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
function validateRows(rows:string[][],extension:"csv"|"xlsx",worksheetName:string|null,worksheets:WorksheetSummary[]):CustomerImportPreview{
 const nonEmpty=rows.filter(row=>row.some(cell=>cell.trim()));
 if(!nonEmpty.length)throw new CustomerImportFileError("empty","We did not find any customer data in this file.");
 const headers=nonEmpty[0].map(value=>value.trim());
 if(!headers.length||headers.every(value=>!value))throw new CustomerImportFileError("missing_headers","Add a header row before uploading the file.");
 if(headers.length>CUSTOMER_IMPORT_LIMITS.columns)throw new CustomerImportFileError("too_many_columns",`Files may contain no more than ${CUSTOMER_IMPORT_LIMITS.columns} columns.`);
 if(headers.some(value=>!value))throw new CustomerImportFileError("missing_headers","Every populated column needs a header.");
 if(headers.some(value=>value.length>CUSTOMER_IMPORT_LIMITS.headerLength))throw new CustomerImportFileError("header_too_long","A column header is too long.");
 if(new Set(headers.map(value=>value.toLocaleLowerCase())).size!==headers.length)throw new CustomerImportFileError("duplicate_headers","Column headers must be unique.");
 let dataRows=nonEmpty.slice(1);if(dataRows[0]?.[0]?.trim().toUpperCase()==="EXAMPLE - DO NOT IMPORT")dataRows=dataRows.slice(1);
 if(dataRows.length>CUSTOMER_IMPORT_LIMITS.rows)throw new CustomerImportFileError("too_many_rows",`Files may contain no more than ${CUSTOMER_IMPORT_LIMITS.rows.toLocaleString()} customer rows.`);
 for(const row of dataRows){if(row.length>headers.length&&row.slice(headers.length).some(value=>value.trim()))throw new CustomerImportFileError("extra_columns","A row contains values beyond the header columns.");if(row.some(value=>value.length>CUSTOMER_IMPORT_LIMITS.cellLength))throw new CustomerImportFileError("cell_too_long","A cell exceeds the 5,000 character safety limit.");}
 const normalized=dataRows.map(row=>headers.map((_,index)=>row[index]?.trim()??""));
 return {extension,worksheetName,worksheets,headers,rowCount:normalized.length,rows:normalized,sourceColumns:headers.map((name,index)=>({name,sampleValues:normalized.map(row=>row[index]).filter(Boolean).slice(0,3)}))};
}
function sheetRows(sheet:ExcelJS.Worksheet){
 const rows:string[][]=[];sheet.eachRow({includeEmpty:false},row=>{const values:string[]=[];for(let index=1;index<=row.cellCount;index+=1){const cell=row.getCell(index),raw=cell.value;if(raw&&typeof raw==="object"&&("formula" in raw||"sharedFormula" in raw))throw new CustomerImportFileError("formula","Remove formulas and upload values only.");values.push(cell.text);}rows.push(values);});return rows;
}
export async function parseCustomerImportFile(file:File,worksheetName?:string|null):Promise<CustomerImportPreview>{
 if(file.size>CUSTOMER_IMPORT_LIMITS.bytes)throw new CustomerImportFileError("file_too_large","Choose a file smaller than 25 MB.");
 const extension=file.name.split(".").pop()?.toLowerCase();if(extension!=="csv"&&extension!=="xlsx")throw new CustomerImportFileError("unsupported_type","Upload a .csv or .xlsx file. Macro-enabled and legacy Excel files are not supported.");
 const buffer=Buffer.from(await file.arrayBuffer());
 if(extension==="csv"){let text:string;try{text=new TextDecoder("utf-8",{fatal:true}).decode(buffer).replace(/^\uFEFF/,"");}catch{throw new CustomerImportFileError("encoding","Save the CSV using UTF-8 encoding and upload it again.");}return validateRows(parseCsv(text),"csv",null,[]);}
 try{
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheets:WorksheetSummary[]=workbook.worksheets.map(sheet=>({name:sheet.name,state:sheet.state,rowCount:Math.max(0,sheet.actualRowCount-1)}));
  const meaningful=workbook.worksheets.filter(sheet=>sheet.actualRowCount>0);if(!meaningful.length)throw new CustomerImportFileError("empty","The workbook has no worksheet data.");
  const selected=worksheetName?workbook.getWorksheet(worksheetName):meaningful.length===1?meaningful[0]:undefined;
  if(!selected)return {extension:"xlsx",worksheetName:null,worksheets,headers:[],sourceColumns:[],rowCount:0,rows:[]};
  return validateRows(sheetRows(selected),"xlsx",selected.name,worksheets);
 }catch(error){if(error instanceof CustomerImportFileError)throw error;throw new CustomerImportFileError("malformed","The Excel file could not be read. Password-protected, macro-enabled, or damaged workbooks are not supported.");}
}
