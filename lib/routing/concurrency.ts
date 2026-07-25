export const ROUTE_EDIT_CONFLICT_CODE = "40001";
export const ROUTE_EDIT_CONFLICT_MESSAGE =
  "This route changed while you were editing it. Refresh the route plan before applying your changes.";

export function parseRoutePlanVersion(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isRouteEditConflict(error: { code?: string; message?: string } | null) {
  return error?.code === ROUTE_EDIT_CONFLICT_CODE
    || error?.message?.includes("changed while you were editing") === true;
}
