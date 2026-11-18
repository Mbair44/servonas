import { useEffect, useState } from "react";
import { ActivityIndicator, Button, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { mobileMe } from "../lib/api";
import { preferences, type Experience } from "../lib/preferences";
import { allowedExperiences, selectedExperience, selectedWorkspace } from "../lib/navigation";

export default function FoundationScreen(){const [session,setSession]=useState<any>(),[ready,setReady]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState<string>(),[savedWorkspace,setSavedWorkspace]=useState<string|null>(null),[savedExperience,setSavedExperience]=useState<string|null>(null);const client=useQueryClient();useEffect(()=>{Promise.all([supabase.auth.getSession(),preferences.workspace(),preferences.experience()]).then(([{data},workspace,experience])=>{setSession(data.session);setSavedWorkspace(workspace);setSavedExperience(experience);setReady(true)});const {data}=supabase.auth.onAuthStateChange((_e,next)=>{setSession(next);client.clear();if(!next){setSavedWorkspace(null);setSavedExperience(null)}});return()=>data.subscription.unsubscribe()},[client]);const me=useQuery({queryKey:["me",session?.user.id],queryFn:({signal})=>mobileMe(signal),enabled:!!session,retry:(n,e:any)=>e?.status===401?false:n<1});if(!ready)return <Center text="Restoring secure session…"/>;if(!session)return <SafeAreaView style={styles.container}><Text style={styles.title}>Servonas</Text><TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail}/><TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/>{error&&<Text>{error}</Text>}<Button title="Sign in" onPress={async()=>{setError(undefined);const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError("Sign-in failed. Check your email and password.")}}/></SafeAreaView>;if(me.isLoading)return <Center text="Loading workspaces…"/>;if(me.isError)return <SafeAreaView style={styles.container}><Text>{(me.error as Error).message}</Text><Button title="Retry" onPress={()=>me.refetch()}/><Button title="Sign out" onPress={()=>supabase.auth.signOut()}/></SafeAreaView>;const workspaces=me.data?.workspaces??[];if(!workspaces.length)return <SafeAreaView style={styles.container}><Text style={styles.title}>No workspace access</Text><Button title="Sign out" onPress={()=>supabase.auth.signOut()}/></SafeAreaView>;const workspace=selectedWorkspace(workspaces,savedWorkspace)!;const experiences=allowedExperiences(workspace),experience=selectedExperience(workspace,savedExperience);const switchWorkspace=async(id:string)=>{client.removeQueries({queryKey:["tenant"]});setSavedWorkspace(id);await preferences.setWorkspace(id)};const switchExperience=async(value:Experience)=>{setSavedExperience(value);await preferences.setExperience(value)};return <SafeAreaView style={styles.container}><Text style={styles.title}>{workspace.displayName}</Text>{workspaces.length>1&&<View style={styles.list}>{workspaces.map(item=><Pressable key={item.id} onPress={()=>switchWorkspace(item.id)}><Text style={item.id===workspace.id?styles.selected:styles.item}>{item.displayName}</Text></Pressable>)}</View>}{experiences.length>1&&<View style={styles.list}>{experiences.map(item=><Button key={item} title={`Use ${item} experience`} onPress={()=>switchExperience(item)}/>)}</View>}<Text style={styles.body}>{experience==="office"?"Owner / manager home placeholder":"Technician home placeholder"}</Text><Text style={styles.body}>Connection verified: {workspaces.length} workspace(s)</Text><Button title="Refresh" onPress={()=>me.refetch()}/><Button title="Sign out" onPress={async()=>{client.clear();await preferences.clear();await supabase.auth.signOut()}}/></SafeAreaView>}
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
  list:{width:"100%"},item:{padding:10},selected:{padding:10,fontWeight:"700",color:"#2563eb"},
});
