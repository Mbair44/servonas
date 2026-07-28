type BusinessSetupNotification = {
  businessId?: string | null;
  businessName: string;
  businessSlug: string;
  businessEmail?: string | null;
  creatorEmail?: string | null;
};

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);

export function businessSetupEmailContent(notification: BusinessSetupNotification, appUrl?: string) {
  const createdAt = new Date().toISOString();
  const workspaceUrl = appUrl
    ? `${appUrl.replace(/\/$/, "")}/app/${encodeURIComponent(notification.businessSlug)}`
    : null;
  const lines = [
    "A new Servonas business workspace was created.",
    `Business: ${notification.businessName}`,
    `Workspace: ${notification.businessSlug}`,
    notification.businessEmail ? `Business email: ${notification.businessEmail}` : null,
    notification.creatorEmail ? `Created by: ${notification.creatorEmail}` : null,
    notification.businessId ? `Business ID: ${notification.businessId}` : null,
    `Created at: ${createdAt}`,
    workspaceUrl ? `Open workspace: ${workspaceUrl}` : null,
  ].filter(Boolean) as string[];

  return {
    subject: `New Servonas business: ${notification.businessName}`,
    text: lines.join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">${lines
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("")}</div>`,
  };
}

export async function sendBusinessSetupNotification(notification: BusinessSetupNotification) {
  const recipient = process.env.ADMIN_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (process.env.EMAIL_DELIVERY_MODE !== "live") {
    console.info("Business setup owner notification skipped", {
      reason: "email_delivery_not_live",
      businessId: notification.businessId,
    });
    return { ok: false as const, configured: false as const };
  }
  if (!recipient || !apiKey || !from) {
    console.error("Business setup owner notification is not configured", {
      missing: [
        !recipient ? "ADMIN_EMAIL" : null,
        !apiKey ? "RESEND_API_KEY" : null,
        !from ? "EMAIL_FROM" : null,
      ].filter(Boolean),
      businessId: notification.businessId,
    });
    return { ok: false as const, configured: false as const };
  }

  const content = businessSetupEmailContent(notification, process.env.NEXT_PUBLIC_APP_URL);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
    });
    const result = await response.json() as ResendResponse;
    if (!response.ok || !result.id) {
      console.error("Business setup owner notification failed", {
        provider: "resend",
        httpStatus: response.status,
        providerStatus: result.statusCode,
        providerError: result.name,
        reason: result.message || "Resend did not return a message ID.",
        businessId: notification.businessId,
      });
      return { ok: false as const, configured: true as const };
    }
    console.info("Business setup owner notification sent", {
      provider: "resend",
      messageId: result.id,
      businessId: notification.businessId,
    });
    return { ok: true as const, configured: true as const, messageId: result.id };
  } catch (error) {
    console.error("Business setup owner notification request failed", {
      provider: "resend",
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : "Email request failed.",
      businessId: notification.businessId,
    });
    return { ok: false as const, configured: true as const };
  }
}
