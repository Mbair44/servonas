const rows=[
 ["Customer Name","Company","Primary Contact","Email","Phone","Customer Status","Account Number","Service Address","Service Address 2","Service City","Service State","Service ZIP","Billing Address","Billing City","Billing State","Billing ZIP","Service","Frequency","Next Service Date","Territory","Notes"],
 ["EXAMPLE - DO NOT IMPORT","Acme Property Management","Dana Ortiz","dana@example.com","555-555-0100","Active","ACME-100","123 Main St","Suite 200","Phoenix","AZ","85004","PO Box 100","Phoenix","AZ","85001","General service","Monthly","2026-08-15","Central","Gate code is available from the office"],
];
const csv=rows.map(row=>row.map(value=>`"${value.replaceAll('"','""')}"`).join(",")).join("\r\n");
export function GET(){return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="servonas-customer-import-template.csv"',"Cache-Control":"private, no-store"}});}
