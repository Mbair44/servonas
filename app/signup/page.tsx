import AuthForm from "@/components/AuthForm"; import {signUp} from "../auth/actions";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const q=await searchParams; return <AuthForm title="Create your account" subtitle="Start building your Servonas workspace." action={signUp} mode="signup" error={q.error}/>}
