import type { Metadata } from "next";
import { WebsiteIndustryDemo } from "@/components/WebsiteIndustryDemo";

export const metadata: Metadata = {
  title: "Christmas Light Installation Website Example | Servonas",
  description: "Example Christmas light installation website built with Servonas.",
  robots: { index: false, follow: true },
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WebsiteIndustryDemo params={await searchParams} config={{
    source: "christmas-lights-website",
    name: "Christmas Lights",
    businessName: "Merry Glow Holiday Lighting",
    industryProfile: "other",
    services: ["Residential Christmas Light Installation", "Roofline Lighting", "Tree Wrapping", "Walkway Lighting", "Wreaths and Garland", "Commercial Christmas Lighting"],
    hero: "Professional Christmas Light Installation Without the Hassle",
    subheading: "We design, install, maintain, and remove your Christmas lights so your home or property shines all season.",
    about: "Merry Glow Holiday Lighting is a fictional Christmas light installation company demonstrating a Servonas-powered quote-first seasonal website.",
    primary: "#c62828",
    secondary: "#113a5c",
    areas: ["Scottsdale", "Paradise Valley", "Phoenix", "Glendale"],
  }} />;
}
