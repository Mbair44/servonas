import type {Metadata} from "next";
import {IndustryLandingPage,type IndustryLandingConfig} from "@/components/IndustryLandingPage";

export const metadata:Metadata={title:"Event & Party Rental Software | Servonas",description:"Event and party rental software for inventory, online availability, blocked dates, delivery workflows, invoices, deposits, and payments."};

const config:IndustryLandingConfig={
 industry:"Event & Party Rentals",
 kicker:"Event and party rental software",
 headline:"Keep every rental, route, and reservation",
 accent:"working together.",
 description:"Manage rental inventory, date availability, customer bookings, delivery schedules, blocked dates, deposits, invoices, and payments from one connected system.",
 proof:["Rental inventory and availability","Delivery and pickup scheduling","Deposits, invoices, and payments"],
 workflow:["Customer browses rentals","Checks date availability","Builds a quote or booking","Schedule delivery and pickup","Invoice and collect payment"],
 features:[
  {title:"Inventory-aware availability",description:"Track quantities, blocked dates, and rental windows so customers only request items that can actually be delivered."},
  {title:"Online rental catalog",description:"Showcase inflatables, tables, chairs, tents, games, and add-ons in a branded customer-facing experience."},
  {title:"Delivery and pickup planning",description:"Coordinate event timing, delivery addresses, crews, and return windows without separate spreadsheets."},
  {title:"Customer and event records",description:"Keep venue details, contact information, event notes, and rental history tied to every booking."},
  {title:"Deposits and payment tracking",description:"Collect configured deposits, send invoices, and keep balances accurate from reservation through final payment."},
  {title:"Booking flow built for rentals",description:"Support event dates, multi-item orders, quantity limits, and customer-friendly availability checks."},
 ],
};

export default function Page(){return <IndustryLandingPage config={config}/>;}
