type FloralWebsiteDesignFieldsProps={
 enabled:boolean;
 disabled?:boolean;
 settings:Record<string,any>|null;
};

const fontOptions=[
 ["elegant","Elegant serif","Refined, timeless, and ideal for weddings"],
 ["romantic","Romantic editorial","Soft, expressive, and celebration focused"],
 ["modern","Clean modern","Simple, polished, and easy to scan"],
] as const;

const photoOptions=[
 ["hero_right","Photos on the right","Keep the headline beside the main photos"],
 ["hero_left","Photos on the left","Lead with imagery before the headline"],
 ["hero_full","Full-width showcase","Place photos across the full hero"],
 ["gallery_first","Gallery first","Feature the photo gallery before services"],
] as const;

export function FloralWebsiteDesignFields({enabled,disabled=false,settings}:FloralWebsiteDesignFieldsProps){
 if(!enabled)return null;
 return <section className="floral-design-controls" aria-labelledby="floral-design-heading">
  <header><div><strong id="floral-design-heading">Floral website style</strong><span>Fine-tune the look while keeping the ready-made floral layout.</span></div></header>
  <fieldset><legend>Font style</legend><div className="floral-choice-grid font-choices">{fontOptions.map(([value,title,description])=><label key={value}><input type="radio" name="floralFontStyle" value={value} defaultChecked={(settings?.floral_font_style??"elegant")===value} disabled={disabled}/><span><b>{title}</b><small>{description}</small></span></label>)}</div></fieldset>
  <div className="floral-color-grid"><label>Accent color<input type="color" name="floralAccentColor" defaultValue={settings?.floral_accent_color??"#b85c7c"} disabled={disabled}/><small>Used for small highlights and floral details.</small></label><label>Page background<input type="color" name="floralBackgroundColor" defaultValue={settings?.floral_background_color??"#fffafc"} disabled={disabled}/><small>Sets the soft background behind website sections.</small></label></div>
  <fieldset><legend>Picture placement</legend><div className="floral-choice-grid photo-choices">{photoOptions.map(([value,title,description])=><label key={value}><input type="radio" name="floralPhotoLayout" value={value} defaultChecked={(settings?.floral_photo_layout??"hero_right")===value} disabled={disabled}/><span><b>{title}</b><small>{description}</small></span></label>)}</div></fieldset>
  <p className="floral-preview-hint">Save, then select Preview Website to see these choices with your photos.</p>
 </section>;
}
