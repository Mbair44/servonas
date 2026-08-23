import AuthForm from "@/components/AuthForm";
import {redirect} from "next/navigation";
import { signIn } from "../auth/actions";
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
    console.warn("Login page auth lookup skipped",{message:error instanceof Error?error.message:String(error)});
  }
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
