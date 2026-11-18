import { useEffect, useState } from "react";
import { ActivityIndicator, Button, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { mobileMe } from "../lib/api";

export default function FoundationScreen(){const [session,setSession]=useState<any>(),[ready,setReady]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState<string>();const client=useQueryClient();useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});const {data}=supabase.auth.onAuthStateChange((_e,next)=>{setSession(next);if(!next)client.clear()});return()=>data.subscription.unsubscribe()},[client]);const me=useQuery({queryKey:["me",session?.user.id],queryFn:({signal})=>mobileMe(signal),enabled:!!session,retry:(n,e:any)=>e?.status===401?false:n<1});if(!ready)return <Center text="Restoring secure session…"/>;if(!session)return <SafeAreaView style={styles.container}><Text style={styles.title}>Servonas</Text><TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail}/><TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/>{error&&<Text>{error}</Text>}<Button title="Sign in" onPress={async()=>{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError("Sign-in failed. Check your email and password.")}}/></SafeAreaView>;if(me.isLoading)return <Center text="Loading workspaces…"/>;if(me.isError)return <SafeAreaView style={styles.container}><Text>{(me.error as Error).message}</Text><Button title="Retry" onPress={()=>me.refetch()}/><Button title="Sign out" onPress={()=>supabase.auth.signOut()}/></SafeAreaView>;const workspaces=me.data?.workspaces??[];if(!workspaces.length)return <SafeAreaView style={styles.container}><Text style={styles.title}>No workspace access</Text><Button title="Sign out" onPress={()=>supabase.auth.signOut()}/></SafeAreaView>;const workspace=workspaces[0],office=workspace.availableCapabilities.includes("operational_dashboard");return <SafeAreaView style={styles.container}><Text style={styles.title}>{workspace.displayName}</Text><Text style={styles.body}>{office?"Owner / manager home placeholder":"Technician home placeholder"}</Text><Text style={styles.body}>Connection verified: {workspaces.length} workspace(s)</Text><Button title="Refresh" onPress={()=>me.refetch()}/><Button title="Sign out" onPress={async()=>{client.clear();await supabase.auth.signOut()}}/></SafeAreaView>}
function Center({text}:{text:string}){return <View style={styles.container}><ActivityIndicator/><Text>{text}</Text></View>}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  body: {
    marginTop: 12,
    textAlign: "center",
  },
  input:{borderWidth:1,borderColor:"#cbd5e1",borderRadius:8,padding:12,width:"100%"},
});
