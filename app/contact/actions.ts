"use server";

import { redirect } from "next/navigation";

const recipient = "mbair@servonas.com";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "").trim();

const contactResult = (kind: "sent" | "error", message?: string) =>
  kind === "sent"
    ? "/contact?sent=1"
    : `/contact?error=${encodeURIComponent(message ?? "Your message could not be sent. Please try again.")}`;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export async function sendContactInquiry(formData: FormData) {
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const company = text(formData, "company");
  const phone = text(formData, "phone");
  const message = text(formData, "message");

  // Bots commonly populate fields hidden from people. Return the normal
  // confirmation so the form cannot be used to probe the spam filter.
  if (text(formData, "website")) redirect(contactResult("sent"));

  if (
    !name ||
    name.length > 120 ||
    !emailPattern.test(email) ||
    email.length > 254 ||
    company.length > 160 ||
    phone.length > 40 ||
    !message ||
    message.length > 5000
  ) {
    redirect(
      contactResult(
        "error",
        "Enter your name, a valid email address, and a message.",
      ),
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.error("Contact inquiry email is not configured", {
      missing: [
        !apiKey ? "RESEND_API_KEY" : null,
        !from ? "EMAIL_FROM" : null,
      ].filter(Boolean),
    });
    redirect(
      contactResult(
        "error",
        "Email delivery is temporarily unavailable. Please try again shortly.",
      ),
    );
  }

  const subject = `Servonas contact inquiry from ${name}`;
  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company || "Not provided"}`,
    `Phone: ${phone || "Not provided"}`,
    "",
    "Message:",
    message,
  ];
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">
      <h2>New Servonas contact inquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Company:</strong> ${escapeHtml(company || "Not provided")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</p>
      <h3>Message</h3>
      <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    </div>`;

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
        reply_to: email,
        subject,
        text: lines.join("\n"),
        html,
      }),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;
    if (!response.ok || !result?.id) {
      console.error("Contact inquiry email failed", {
        httpStatus: response.status,
        reason: result?.message || "Resend did not return a message ID.",
      });
      redirect(
        contactResult(
          "error",
          "Your message could not be sent. Please try again.",
        ),
      );
    }
  } catch (error) {
    // Next.js redirects are implemented as thrown framework errors.
    if (
      error instanceof Error &&
      (error.message === "NEXT_REDIRECT" ||
        error.message.startsWith("NEXT_REDIRECT;"))
    ) {
      throw error;
    }
    console.error("Contact inquiry email request failed", {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage:
        error instanceof Error ? error.message : "Email request failed.",
    });
    redirect(
      contactResult(
        "error",
        "Your message could not be sent. Please try again.",
      ),
    );
  }

  redirect(contactResult("sent"));
}
