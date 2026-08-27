import type { Metadata } from "next";
import { WebsiteIndustryDemo } from "@/components/WebsiteIndustryDemo";

export const metadata: Metadata = {
  title: "Junk Removal Website Example | Servonas",
  description: "Example junk removal website built with Servonas.",
  robots: { index: false, follow: true },
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WebsiteIndustryDemo params={await searchParams} config={{
    source: "junk-removal-website",
    name: "Junk Removal",
    businessName: "Junk Devils",
    industryProfile: "junk_removal",
    services: ["Furniture Removal", "Appliance Removal", "Garage Cleanouts", "Yard Waste Removal", "Estate Cleanouts", "Construction Debris Removal"],
    hero: "Got Junk? The Devils Will Take It Away.",
    subheading: "Furniture, appliances, garage cleanouts, yard debris, and more. Point to what needs to go and Junk Devils will handle the lifting.",
    about: "Junk Devils is a fictional junk removal business demonstrating a Servonas-powered website built to turn local traffic into quote requests.",
    primary: "#c65a12",
    secondary: "#1f2937",
    areas: ["Phoenix", "Glendale", "Peoria", "Surprise"],
  }} />;
}
