import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {EmployeeImportFileError,parseEmployeeImportFile} from "../lib/employeeImport/file.ts";

test("parses CSV headers and excludes the template example row",async()=>{
  const csv="First Name,Last Name,Email\r\nEXAMPLE - DO NOT IMPORT,Employee,employee@example.com\r\nAda,Lovelace,ada@example.com";
  const result=await parseEmployeeImportFile(new File([csv],"employees.csv",{type:"text/csv"}));
  assert.equal(result.rowCount,1);
  assert.deepEqual(result.headers,["First Name","Last Name","Email"]);
  assert.deepEqual(result.sourceColumns[0].sampleValues,["Ada"]);
});

test("rejects duplicate headers and excessive employee rows",async()=>{
  await assert.rejects(
    parseEmployeeImportFile(new File(["Email,email\none,two"],"employees.csv",{type:"text/csv"})),
    (error:unknown)=>error instanceof EmployeeImportFileError&&error.category==="duplicate_headers",
  );
  const rows=["Name",...Array.from({length:2001},(_,index)=>`Employee ${index}`)].join("\n");
  await assert.rejects(
    parseEmployeeImportFile(new File([rows],"employees.csv",{type:"text/csv"})),
    (error:unknown)=>error instanceof EmployeeImportFileError&&error.category==="too_many_rows",
  );
});

test("reads XLSX values but rejects workbook formulas",async()=>{
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Employees");
  sheet.addRow(["First Name","Email"]); sheet.addRow(["Ada","ada@example.com"]);
  const bytes=await workbook.xlsx.writeBuffer();
  const parsed=await parseEmployeeImportFile(new File([bytes as BlobPart],"employees.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  assert.equal(parsed.rowCount,1);
  sheet.getCell("A2").value={formula:'HYPERLINK("https://example.com")',result:"Ada"};
  const formulaBytes=await workbook.xlsx.writeBuffer();
  await assert.rejects(
    parseEmployeeImportFile(new File([formulaBytes as BlobPart],"employees.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),
    (error:unknown)=>error instanceof EmployeeImportFileError&&error.category==="formula",
  );
});
