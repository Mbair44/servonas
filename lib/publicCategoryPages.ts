export type PublishedCategoryPage={category_id:string;slug:string;updated_at?:string|null};

export function activeCategoryIds(items:Array<{category_id?:string|null}>){
 return new Set(items.flatMap(item=>item.category_id?[item.category_id]:[]));
}

export function indexableCategoryPages<T extends PublishedCategoryPage>(pages:T[],items:Array<{category_id?:string|null}>){
 const active=activeCategoryIds(items);
 return pages.filter(page=>active.has(page.category_id));
}

export function categoryPageIsIndexable(categoryId:string,items:Array<{category_id?:string|null}>){
 return activeCategoryIds(items).has(categoryId);
}
