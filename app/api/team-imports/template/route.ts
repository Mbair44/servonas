const template=[
  ["First Name","Last Name","Email","Phone","Employee ID","Role","Employee Type","Start Date","Status","Manager Email/ID","Location","Territory","Skills","Invite"],
  ["EXAMPLE - DO NOT IMPORT","Employee","employee@example.com","555-555-0100","EMP-100","technician","full_time","2026-08-01","active","","Phoenix","East Valley","HVAC; EPA","yes"],
];
const csv=template.map(row=>row.map(value=>`"${value.replaceAll('"','""')}"`).join(",")).join("\r\n");
export function GET(){
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="servonas-employee-import-template.csv"',"Cache-Control":"private, no-store"}});
}
