export type InvoiceStatus = "draft" | "sent" | "viewed" | "partially_paid" | "paid" | "overdue" | "void" | "uncollectible" | "refunded";

export function deriveInvoicePaymentStatus({
  grandTotalCents,
  amountPaidCents,
  amountRefundedCents,
  currentStatus,
  overdue,
}: {
  grandTotalCents: number;
  amountPaidCents: number;
  amountRefundedCents: number;
  currentStatus: InvoiceStatus;
  overdue: boolean;
}): InvoiceStatus {
  if (currentStatus === "void" || currentStatus === "uncollectible") return currentStatus;
  const netPaid = amountPaidCents - amountRefundedCents;
  if (amountPaidCents > 0 && amountRefundedCents === amountPaidCents) return "refunded";
  if (netPaid >= grandTotalCents) return "paid";
  if (netPaid > 0) return "partially_paid";
  if (overdue) return "overdue";
  return currentStatus === "draft" ? "draft" : "sent";
}
