"use client";
import {useMemo,useState} from "react";
import {
  employeeImportDestinations,previewFullNameSplit,suggestEmployeeImportMapping,
  validateEmployeeColumnMappings,type EmployeeColumnMapping,
} from "@/lib/employeeImport/mapping";

type SourceColumn={name:string;sampleValues?:string[]};

export function ColumnMappingForm({sourceColumns,initialMappings,appliedProfileId,action}:{sourceColumns:SourceColumn[];initialMappings?:EmployeeColumnMapping[];appliedProfileId?:string;action:(formData:FormData)=>void|Promise<void>}){
  const defaults=useMemo(()=>sourceColumns.map((source,sourceOrdinal)=>{
    const saved=initialMappings?.find(mapping=>mapping.sourceOrdinal===sourceOrdinal);
    if(saved) return saved;
    const suggestion=suggestEmployeeImportMapping(source.name);
    return {sourceColumn:source.name,sourceOrdinal,destinationField:suggestion.destinationField,transformation:suggestion.transformation,confidence:suggestion.confidence,isIgnored:!suggestion.destinationField} satisfies EmployeeColumnMapping;
  }),[sourceColumns,initialMappings]);
  const [mappings,setMappings]=useState(defaults);
  const issue=validateEmployeeColumnMappings(mappings);
  const selected=mappings.filter(mapping=>!mapping.isIgnored&&mapping.destinationField);
  const duplicates=new Set(selected.filter((mapping,index)=>selected.findIndex(other=>other.destinationField===mapping.destinationField)!==index).map(mapping=>mapping.destinationField));
  const update=(ordinal:number,destinationField:string)=>{
    setMappings(current=>current.map(mapping=>{
      if(mapping.sourceOrdinal!==ordinal) return mapping;
      const suggestion=suggestEmployeeImportMapping(mapping.sourceColumn);
      return {...mapping,destinationField:destinationField||null,isIgnored:!destinationField,
        transformation:destinationField==="full_name"?"split_name":"none",
        confidence:destinationField&&destinationField===suggestion.destinationField?suggestion.confidence:destinationField?"manual":"unmatched"};
    }));
  };
  return <form action={action} className="column-mapping-form">
    <input type="hidden" name="appliedProfileId" value={appliedProfileId??""}/>
    <div className="mapping-summary" aria-live="polite"><div><strong>{selected.length}</strong><span>Mapped</span></div><div><strong>{mappings.length-selected.length}</strong><span>Ignored</span></div><div><strong>{duplicates.size}</strong><span>Conflicts</span></div></div>
    {issue&&<p className="form-error" role="alert">{issue}</p>}
    <div className="mapping-list">{mappings.map(mapping=>{
      const source=sourceColumns[mapping.sourceOrdinal],destination=employeeImportDestinations.find(field=>field.value===mapping.destinationField);
      const fullPreview=mapping.destinationField==="full_name"?source.sampleValues?.slice(0,2).map(previewFullNameSplit):[];
      return <article className={duplicates.has(mapping.destinationField)?"has-conflict":""} key={mapping.sourceOrdinal}>
        <div className="mapping-source"><span>Spreadsheet column</span><strong>{mapping.sourceColumn}</strong><div>{source.sampleValues?.length?source.sampleValues.map((sample,index)=><code key={`${sample}-${index}`}>{sample}</code>):<em>No sample values</em>}</div></div>
        <span className="mapping-arrow" aria-hidden="true">→</span>
        <label><span>Servonas field</span><select value={mapping.destinationField??""} onChange={event=>update(mapping.sourceOrdinal,event.target.value)} aria-label={`Map ${mapping.sourceColumn}`}>
          <option value="">Ignore this column</option>{employeeImportDestinations.map(field=><option value={field.value} key={field.value}>{field.label}{field.required?" (required)":""}</option>)}
        </select>{destination&&<small className={`mapping-confidence ${mapping.confidence}`}>{mapping.confidence==="manual"?"Selected manually":`${mapping.confidence} confidence`}</small>}{duplicates.has(mapping.destinationField)&&<small className="mapping-conflict">This field is mapped more than once.</small>}</label>
        {fullPreview?.length?<div className="name-split-preview"><strong>Name split preview</strong>{fullPreview.map((preview,index)=><span key={index}>{preview.firstName||"—"} <b>|</b> {preview.lastName||"Needs a last name"}{!preview.reliable&&<em> Review</em>}</span>)}</div>:null}
        <input type="hidden" name={`source_${mapping.sourceOrdinal}`} value={mapping.sourceColumn}/><input type="hidden" name={`destination_${mapping.sourceOrdinal}`} value={mapping.destinationField??""}/>
      </article>;
    })}</div>
    <section className="mapping-save"><label>Save as a reusable profile <small>Optional</small><input name="profileName" maxLength={100} placeholder="Example: Jobber employee export"/></label><p>Profiles are reused only when the spreadsheet headers match. Your source file remains unchanged.</p><button className="sv-button" disabled={Boolean(issue)} type="submit">Confirm column mappings</button></section>
  </form>;
}
