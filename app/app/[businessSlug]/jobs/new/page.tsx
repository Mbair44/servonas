import {redirect} from "next/navigation";

export default async function NewJob({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<{ customerId?: string }> }) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const search=new URLSearchParams({addJob:"1"});if(query.customerId)search.set("customerId",query.customerId);
  redirect(`/app/${businessSlug}/jobs?${search.toString()}`);
}
