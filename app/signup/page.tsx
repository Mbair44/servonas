import AuthForm from "@/components/AuthForm";
import {redirect} from "next/navigation";
import { signUp } from "../auth/actions";
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
      title="Create your account"
      subtitle="Start building your Servonas workspace."
      action={signUp}
      mode="signup"
      error={query.error}
      next={query.next}
      email={query.email}
      utmContent={query.utm_content}
      source={query.source}
    />
  );
}
