export function downloadCsv(filename:string,headers:string[],rows:Array<Array<string|number|null|undefined>>){
  const escape=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
  const csv=[headers,...rows].map(row=>row.map(escape).join(",")).join("\r\n");
  const link=document.createElement("a");
  link.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
  link.download=filename;link.click();URL.revokeObjectURL(link.href);
}
