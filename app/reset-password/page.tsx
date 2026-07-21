import AuthForm from "@/components/AuthForm"; import {updatePassword} from "../auth/actions";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const q=await searchParams; return <AuthForm title="Choose a new password" subtitle="Use at least eight characters." action={updatePassword} mode="reset" error={q.error}/>}
