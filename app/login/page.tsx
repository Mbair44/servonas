import AuthForm from "@/components/AuthForm";
import {redirect} from "next/navigation";
import { signIn } from "../auth/actions";
import {createSupabaseServerClient} from "@/lib/supabaseServer";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [query,supabase]=await Promise.all([searchParams,createSupabaseServerClient()]);
  const {data:{user}}=await supabase.auth.getUser();
  if(user)redirect("/app");
  return (
    <AuthForm
      title="Welcome back"
      subtitle="Log in to manage your business."
      action={signIn}
      mode="login"
      error={query.error}
      next={query.next}
      email={query.email}
    />
  );
}
