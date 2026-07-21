import AuthForm from "@/components/AuthForm";
import { signIn } from "../auth/actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
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
