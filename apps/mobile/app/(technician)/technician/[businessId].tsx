import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
// The group keeps technician-only routes separate without changing the public path.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { mobileJobs, mobileMe, technicianHome } from "../../../lib/api";
import { mobileMeQueryKey, tenantQueryKey } from "../../../lib/queryState";
import { AppHeader, EmptyState, ErrorState, JobCard, LoadingState, Screen, colors } from "../../../components/mobile-ui";

export default function TechnicianHome(){
  const {businessId}=useLocalSearchParams<{businessId:string}>(),router=useRouter();
  const [range,setRange]=useState<"today"|"upcoming"|"past">("today");
  const me=useQuery({queryKey:mobileMeQueryKey(),queryFn:({signal})=>mobileMe(signal),retry:1});
  const workspace=me.data?.workspaces.find(item=>item.id===businessId), eligible=!!workspace?.technicianEligible;
  const home=useQuery({queryKey:tenantQueryKey(me.data?.user.id??"pending",businessId,"technician-home"),queryFn:({signal})=>technicianHome(businessId,signal),enabled:!!businessId&&!!me.data?.user.id&&eligible,retry:(attempt,error:any)=>error?.status===401||error?.status===403||error?.status===404?false:attempt<1});
  const jobs=useQuery({queryKey:tenantQueryKey(me.data?.user.id??"pending",businessId,"jobs",range),queryFn:({signal})=>mobileJobs(businessId,range,signal),enabled:!!businessId&&!!me.data?.user.id&&eligible,retry:1});
  const go=(jobId:string)=>router.push({pathname:"/jobs/[businessId]/[jobId]",params:{businessId,jobId}});
  if(me.isLoading||home.isLoading||jobs.isLoading)return <SafeAreaView style={styles.safe}><LoadingState/></SafeAreaView>;
  if(me.isError||home.isError||jobs.isError)return <SafeAreaView style={styles.safe}><Screen><AppHeader title="My jobs" onSettings={()=>router.replace("/")}/><ErrorState message={(jobs.error??home.error??me.error as Error)?.message??"Please check your connection."} onRetry={()=>{void me.refetch();void home.refetch();void jobs.refetch();}}/></Screen></SafeAreaView>;
  if(!eligible)return <SafeAreaView style={styles.safe}><Screen><AppHeader title="My jobs" onSettings={()=>router.replace("/")}/><ErrorState message="Technician access is unavailable for this workspace." onRetry={()=>router.replace("/")}/></Screen></SafeAreaView>;
  const data=home.data!, listed=jobs.data!,groups=listed.items.reduce<Record<string,typeof listed.items>>((result,job)=>{const key=job.startsAt?new Intl.DateTimeFormat(undefined,{timeZone:listed.timezone,weekday:"long",month:"short",day:"numeric"}).format(new Date(job.startsAt)):"Unscheduled";(result[key]??=[]).push(job);return result;},{});
  return <SafeAreaView style={styles.safe}><Screen refreshing={home.isFetching||jobs.isFetching} onRefresh={()=>{void home.refetch();void jobs.refetch();}}>
    <AppHeader title="My jobs" subtitle={`${data.technician.displayName} · ${data.workspace.displayName}`} onSettings={()=>router.replace("/")}/>
    <Text style={styles.sectionTitle}>Current job</Text>
    {data.currentJob?<JobCard job={data.currentJob} timezone={listed.timezone} onPress={()=>go(data.currentJob!.id)}/>:<EmptyState title="No job in progress" detail="When you are en route or working on an assigned job, it will appear here."/>}
    <View style={styles.tabs}>{(["today","upcoming","past"] as const).map(value=><Pressable key={value} onPress={()=>setRange(value)} style={[styles.tab,range===value&&styles.selectedTab]}><Text style={[styles.tabText,range===value&&styles.selectedTabText]}>{value[0].toUpperCase()+value.slice(1)}</Text></Pressable>)}</View>
    <Text style={styles.sectionTitle}>{range[0].toUpperCase()+range.slice(1)}</Text>
    {listed.items.length?(range==="today"?listed.items.map(job=><JobCard key={job.id} job={job} timezone={listed.timezone} onPress={()=>go(job.id)}/>):Object.entries(groups).map(([date,jobs])=><View key={date} style={styles.group}><Text style={styles.groupTitle}>{date}</Text>{jobs.map(job=><JobCard key={job.id} job={job} timezone={listed.timezone} onPress={()=>go(job.id)}/>)}</View>)):<EmptyState title={`No ${range} jobs`} detail={range==="upcoming"?"No assigned jobs are scheduled in the next 30 days.":range==="past"?"No assigned jobs were scheduled in the previous 30 days.":"Your assigned work for today is clear."}/>}
  </Screen></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},sectionTitle:{fontSize:20,fontWeight:"800",color:colors.navy,marginTop:4},tabs:{flexDirection:"row",gap:8},tab:{flex:1,minHeight:42,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:colors.border,borderRadius:10,backgroundColor:colors.card},selectedTab:{backgroundColor:colors.blue,borderColor:colors.blue},tabText:{fontWeight:"800",color:colors.navy},selectedTabText:{color:"#fff"},group:{gap:10},groupTitle:{fontSize:16,fontWeight:"800",color:colors.muted}});
