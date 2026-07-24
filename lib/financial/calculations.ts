export type Discount =
  | { type: "none"; value: 0 }
  | { type: "fixed"; value: number }
  | { type: "percentage"; value: number };

export type FinancialLineInput = {
  id?: string;
  currency: string;
  quantity: string;
  unitPriceCents: number;
  taxable: boolean;
  taxRateBasisPoints?: number;
  discount?: Discount;
};

export type FinancialDocumentInput = {
  currency: string;
  lines: FinancialLineInput[];
  documentDiscount?: Discount;
  feesCents?: number[];
  deposit?: Discount;
  amountPaidCents?: number;
  amountRefundedCents?: number;
};

const SCALE = 10_000n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function assertCurrency(value: string) {
  if (!/^[A-Z]{3}$/.test(value)) throw new Error("Currency must be a three-letter ISO code.");
}

function cents(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer number of cents.`);
  return BigInt(value);
}

function basisPoints(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new Error(`${field} must be between 0 and 10000 basis points.`);
  return BigInt(value);
}

function quantityUnits(value: string) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)) throw new Error("Quantity must be positive with no more than four decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, "0"));
  if (scaled <= 0n) throw new Error("Quantity must be greater than zero.");
  return scaled;
}

/** Integer division rounded half away from zero (all current inputs are >= 0). */
function roundDivide(value: bigint, divisor: bigint) {
  return (value + divisor / 2n) / divisor;
}

function calculateDiscount(base: bigint, discount: Discount | undefined, field: string) {
  if (!discount || discount.type === "none") return 0n;
  const result = discount.type === "fixed"
    ? cents(discount.value, field)
    : roundDivide(base * basisPoints(discount.value, field), 10_000n);
  return result > base ? base : result;
}

function safeNumber(value: bigint, field: string) {
  if (value > MAX_SAFE) throw new Error(`${field} exceeds the supported safe integer range.`);
  return Number(value);
}

export function calculateFinancialDocument(input: FinancialDocumentInput) {
  assertCurrency(input.currency);
  if (!input.lines.length) throw new Error("At least one line item is required.");

  const lines = input.lines.map((line, index) => {
    assertCurrency(line.currency);
    if (line.currency !== input.currency) throw new Error("Every line item must use the document currency.");
    const subtotal = roundDivide(
      quantityUnits(line.quantity) * cents(line.unitPriceCents, `Line ${index + 1} unit price`),
      SCALE,
    );
    const lineDiscount = calculateDiscount(subtotal, line.discount, `Line ${index + 1} discount`);
    return {
      id: line.id,
      subtotal,
      lineDiscount,
      afterLineDiscount: subtotal - lineDiscount,
      taxable: line.taxable,
      taxRate: line.taxable ? basisPoints(line.taxRateBasisPoints ?? 0, `Line ${index + 1} tax rate`) : 0n,
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0n);
  const lineDiscountTotal = lines.reduce((sum, line) => sum + line.lineDiscount, 0n);
  const afterLineDiscounts = subtotal - lineDiscountTotal;
  const documentDiscount = calculateDiscount(afterLineDiscounts, input.documentDiscount, "Document discount");

  // Allocate the document discount proportionally. The final line receives the
  // remainder, guaranteeing allocations exactly equal the document discount.
  let remainingDiscount = documentDiscount;
  let remainingBase = afterLineDiscounts;
  const calculatedLines = lines.map((line) => {
    const documentDiscountShare = line.afterLineDiscount === 0n || remainingBase === 0n
      ? 0n
      : line.afterLineDiscount === remainingBase
        ? remainingDiscount
        : (remainingDiscount * line.afterLineDiscount) / remainingBase;
    remainingDiscount -= documentDiscountShare;
    remainingBase -= line.afterLineDiscount;
    const taxableAmount = line.afterLineDiscount - documentDiscountShare;
    const tax = line.taxable ? roundDivide(taxableAmount * line.taxRate, 10_000n) : 0n;
    return {
      id: line.id,
      lineSubtotalCents: safeNumber(line.subtotal, "Line subtotal"),
      lineDiscountCents: safeNumber(line.lineDiscount, "Line discount"),
      documentDiscountShareCents: safeNumber(documentDiscountShare, "Document discount allocation"),
      taxableAmountCents: safeNumber(line.taxable ? taxableAmount : 0n, "Taxable amount"),
      taxCents: safeNumber(tax, "Line tax"),
      lineTotalCents: safeNumber(taxableAmount + tax, "Line total"),
    };
  });

  const taxTotal = calculatedLines.reduce((sum, line) => sum + BigInt(line.taxCents), 0n);
  const feeTotal = (input.feesCents ?? []).reduce((sum, fee, index) => sum + cents(fee, `Fee ${index + 1}`), 0n);
  const discountTotal = lineDiscountTotal + documentDiscount;
  const grandTotal = subtotal - discountTotal + taxTotal + feeTotal;
  const depositRequired = calculateDiscount(grandTotal, input.deposit, "Deposit");
  const amountPaid = cents(input.amountPaidCents ?? 0, "Amount paid");
  const amountRefunded = cents(input.amountRefundedCents ?? 0, "Amount refunded");
  if (amountRefunded > amountPaid) throw new Error("Amount refunded cannot exceed amount paid.");
  const netPaid = amountPaid - amountRefunded;
  const balanceDue = grandTotal > netPaid ? grandTotal - netPaid : 0n;

  return {
    currency: input.currency,
    lines: calculatedLines,
    subtotalCents: safeNumber(subtotal, "Subtotal"),
    lineDiscountTotalCents: safeNumber(lineDiscountTotal, "Line discount total"),
    documentDiscountTotalCents: safeNumber(documentDiscount, "Document discount total"),
    discountTotalCents: safeNumber(discountTotal, "Discount total"),
    taxTotalCents: safeNumber(taxTotal, "Tax total"),
    feeTotalCents: safeNumber(feeTotal, "Fee total"),
    grandTotalCents: safeNumber(grandTotal, "Grand total"),
    depositRequiredCents: safeNumber(depositRequired, "Deposit required"),
    amountPaidCents: safeNumber(amountPaid, "Amount paid"),
    amountRefundedCents: safeNumber(amountRefunded, "Amount refunded"),
    netPaidCents: safeNumber(netPaid, "Net paid"),
    balanceDueCents: safeNumber(balanceDue, "Balance due"),
  };
}
