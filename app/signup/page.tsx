import AuthForm from "@/components/AuthForm";
import {redirect} from "next/navigation";
import { signUp } from "../auth/actions";
import {createSupabaseServerClient, hasSupabaseAuthCookies} from "@/lib/supabaseServer";
import {cookies} from "next/headers";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const cookieStore=await cookies();
  if(hasSupabaseAuthCookies(cookieStore))try{
    const supabase=await createSupabaseServerClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(user)redirect("/app");
  }catch(error){
    console.warn("Signup page auth lookup skipped",{message:error instanceof Error?error.message:String(error)});
  }
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
