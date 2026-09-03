import type { Metadata } from "next";
import { WebsiteIndustryLanding, type WebsiteIndustryLandingConfig } from "@/components/WebsiteIndustryLanding";

export const metadata: Metadata = {
  title: "Christmas Light Installation Website Builder | Servonas",
  description: "Turn Google Ads and Meta traffic into Christmas light installation quote requests with a polished Servonas website, customer tools, job workflow, invoicing, and payments in one place.",
  keywords: ["christmas light installation website", "holiday lighting website builder", "christmas lights web design", "holiday lighting quote requests"],
  alternates: { canonical: "/christmas-lights-website" },
};

const config: WebsiteIndustryLandingConfig = {
  source: "christmas-lights-website",
  name: "Christmas Lights",
  plural: "Christmas light installation companies",
  eyebrow: "Websites for Christmas light installation companies",
  headline: "A premium holiday-lighting website built to win quote requests.",
  description: "Get a festive but polished website, your first-year standard domain, quote requests, customer tracking, scheduling, invoicing, payments, and the operational tools needed for installation, maintenance, and takedown season.",
  demoPath: "/demo/christmas-lights",
  services: ["Roofline Lighting", "Tree Wrapping", "Commercial Lighting"],
  audiences: ["Holiday-light owner-operators", "Residential install crews", "Commercial lighting teams", "Seasonal growth-focused companies"],
  accentClass: "christmas-lights-website-landing",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WebsiteIndustryLanding config={config} params={await searchParams} />;
}
