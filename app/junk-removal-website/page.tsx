import type { Metadata } from "next";
import { WebsiteIndustryLanding, type WebsiteIndustryLandingConfig } from "@/components/WebsiteIndustryLanding";

export const metadata: Metadata = {
  title: "Junk Removal Website Builder | Servonas",
  description: "Turn Facebook and Google traffic into junk removal quote requests with a Servonas junk removal website, customer tools, and job workflow in one place.",
  keywords: ["junk removal website", "junk removal website builder", "junk hauling website", "junk removal web design"],
  alternates: { canonical: "/junk-removal-website" },
};

const config: WebsiteIndustryLandingConfig = {
  source: "junk-removal-website",
  name: "Junk Removal",
  plural: "junk removal businesses",
  eyebrow: "Websites for junk removal businesses",
  headline: "A Junk Removal Website That Actually Brings You Jobs",
  description: "Turn Facebook and Google traffic into quote requests with a junk removal website built for local trust, fast follow-up, scheduling, customers, invoices, and job workflow in one place.",
  image: "/images/junk-removal-team-loading-truck.png",
  imageAlt: "Two junk removal professionals loading bulky household items into a box truck in a residential driveway",
  demoPath: "/demo/junk-removal",
  services: ["Furniture Removal", "Appliance Removal", "Garage Cleanouts"],
  audiences: ["Owner-operators", "Local junk haulers", "Property cleanout crews", "Small junk removal teams"],
  accentClass: "junk-removal-website-landing",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WebsiteIndustryLanding config={config} params={await searchParams} />;
}
