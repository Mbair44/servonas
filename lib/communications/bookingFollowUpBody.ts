export function bookingFollowUpBody(input: { businessName: string; firstName: string; balanceCents: number; manageUrl: string; reviewUrl?: string }) {
 const greeting = input.firstName ? `Hi ${input.firstName}, ` : "";
 const payment = input.balanceCents > 0
  ? `your remaining balance is ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.balanceCents / 100)}. You can pay securely and manage your booking here: ${input.manageUrl}`
  : `thank you for your payment! You can manage your booking here: ${input.manageUrl}`;
 return `${input.businessName}: ${greeting}${payment}${input.reviewUrl ? ` We'd also appreciate an honest Google review: ${input.reviewUrl}` : ""} Reply STOP to opt out.`;
}
