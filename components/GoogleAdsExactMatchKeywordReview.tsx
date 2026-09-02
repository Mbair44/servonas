"use client";

import { useState } from "react";

type Suggestion = { id: string; text: string; matchType: string | null };
type ApplyAction = (formData: FormData) => void | Promise<void>;

export function GoogleAdsExactMatchKeywordReview({ suggestions, action }: { suggestions: Suggestion[]; action: ApplyAction }) {
 const [selected, setSelected] = useState(() => new Set(suggestions.map((suggestion) => suggestion.id)));
 const selectedCount = selected.size;
 const toggle = (id: string) => setSelected((current) => {
  const next = new Set(current);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
 });
 const selectAll = () => setSelected(new Set(suggestions.map((suggestion) => suggestion.id)));
 const clear = () => setSelected(new Set());
 const label = `Add ${selectedCount} exact-match keyword${selectedCount === 1 ? "" : "s"}`;

 return <details className="google-ads-exact-match-review">
  <summary>Make exact-match versions</summary>
  <div className="google-ads-exact-match-body">
   <p>Servonas will add exact-match versions of the selected keywords. Your current phrase-match keywords will stay active.</p>
   <div className="google-ads-exact-match-utilities"><span>{suggestions.length} keyword{suggestions.length === 1 ? "" : "s"} suggested</span>{suggestions.length > 1 && <div><button type="button" onClick={selectAll}>Select all</button><button type="button" onClick={clear}>Clear</button></div>}</div>
   <form action={action}>
    <div className="google-ads-exact-match-list">
     {suggestions.map((keyword) => { const checked = selected.has(keyword.id); return <label key={keyword.id} className={checked ? "is-selected" : ""}><input type="checkbox" name="keywordIds" value={keyword.id} checked={checked} onChange={() => toggle(keyword.id)} /><span><strong>{keyword.text}</strong><small>{keyword.matchType ? keyword.matchType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Phrase"} → Exact</small></span></label>; })}
    </div>
    <input type="hidden" name="confirmExactMatch" value="apply" />
    <footer><span>{selectedCount} selected</span><button className="sv-button" type="submit" disabled={selectedCount === 0}>{label}</button></footer>
   </form>
  </div>
 </details>;
}
