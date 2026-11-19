import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
// The group keeps office-only routes separate without changing the public path.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { mobileJobs, mobileMe, ownerManagerHome } from "../../../lib/api";
import { mobileMeQueryKey, tenantQueryKey } from "../../../lib/queryState";
import { AppHeader, EmptyState, ErrorState, JobCard, LoadingState, Metric, Screen, colors } from "../../../components/mobile-ui";

export default function OfficeHome(){
  const {businessId}=useLocalSearchParams<{businessId:string}>(), router=useRouter();
  const [range,setRange]=useState<"today"|"upcoming"|"past">("today");
  const me=useQuery({queryKey:mobileMeQueryKey(),queryFn:({signal})=>mobileMe(signal),retry:1});
  const workspace=me.data?.workspaces.find(item=>item.id===businessId), eligible=!!workspace?.availableCapabilities.includes("operational_dashboard");
  const home=useQuery({queryKey:tenantQueryKey(me.data?.user.id??"pending",businessId,"owner-home"),queryFn:({signal})=>ownerManagerHome(businessId,signal),enabled:!!businessId&&!!me.data?.user.id&&eligible,retry:(attempt,error:any)=>error?.status===401||error?.status===403||error?.status===404?false:attempt<1});
  const jobs=useQuery({queryKey:tenantQueryKey(me.data?.user.id??"pending",businessId,"jobs",range),queryFn:({signal})=>mobileJobs(businessId,range,signal),enabled:!!businessId&&!!me.data?.user.id&&eligible,retry:1});
  if(me.isLoading||home.isLoading||jobs.isLoading)return <SafeAreaView style={styles.safe}><LoadingState/></SafeAreaView>;
  if(me.isError||home.isError||jobs.isError)return <SafeAreaView style={styles.safe}><Screen><AppHeader title="Office home" onSettings={()=>router.replace("/")}/><ErrorState message={(jobs.error??home.error??me.error as Error)?.message??"Please check your connection."} onRetry={()=>{void me.refetch();void home.refetch();void jobs.refetch();}}/></Screen></SafeAreaView>;
  if(!eligible)return <SafeAreaView style={styles.safe}><Screen><AppHeader title="Office home" onSettings={()=>router.replace("/")}/><ErrorState message="Office access is unavailable for this workspace." onRetry={()=>router.replace("/")}/></Screen></SafeAreaView>;
  const data=home.data!,listed=jobs.data!,groups=listed.items.reduce<Record<string,typeof listed.items>>((result,job)=>{const key=job.startsAt?new Intl.DateTimeFormat(undefined,{timeZone:listed.timezone,weekday:"long",month:"short",day:"numeric"}).format(new Date(job.startsAt)):"Unscheduled";(result[key]??=[]).push(job);return result;},{});
  return <SafeAreaView style={styles.safe}><Screen refreshing={home.isFetching||jobs.isFetching} onRefresh={()=>{void home.refetch();void jobs.refetch();}}>
    <AppHeader title="Today" subtitle={`${data.workspace.displayName} · ${data.operational.asOfDate}`} onSettings={()=>router.replace("/")}/>
    <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:"/messages/[businessId]",params:{businessId}})} style={styles.messages}><Text style={styles.messagesText}>Messages</Text></Pressable>
    <View style={styles.metrics}><Metric value={data.operational.jobsToday} label="Jobs today" accent/><Metric value={data.operational.inProgressJobs} label="In progress"/><Metric value={data.operational.unassignedJobs} label="Unassigned"/><Metric value={data.operational.techniciansWorking} label="Technicians working"/></View>
    <View style={styles.tabs}>{(["today","upcoming","past"] as const).map(value=><Pressable key={value} onPress={()=>setRange(value)} style={[styles.tab,range===value&&styles.selectedTab]}><Text style={[styles.tabText,range===value&&styles.selectedTabText]}>{value[0].toUpperCase()+value.slice(1)}</Text></Pressable>)}</View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{range[0].toUpperCase()+range.slice(1)} jobs</Text><Text style={styles.sectionDetail}>{range==="today"?`${data.operational.pendingBookings} pending booking${data.operational.pendingBookings===1?"":"s"}`:"Business-local schedule"}</Text></View>
    {listed.truncated?<Text style={styles.notice}>Showing the first 100 {range} jobs. Refine this schedule in the web app.</Text>:null}
    {listed.items.length?(range==="today"?listed.items.map(job=><JobCard key={job.id} job={job} timezone={listed.timezone} onPress={()=>router.push({pathname:"/jobs/[businessId]/[jobId]",params:{businessId,jobId:job.id}})}/>):Object.entries(groups).map(([date,jobs])=><View key={date} style={styles.group}><Text style={styles.groupTitle}>{date}</Text>{jobs.map(job=><JobCard key={job.id} job={job} timezone={listed.timezone} onPress={()=>router.push({pathname:"/jobs/[businessId]/[jobId]",params:{businessId,jobId:job.id}})}/>)}</View>)):<EmptyState title={`No ${range} jobs`} detail={range==="upcoming"?"No jobs are scheduled in the next 30 days.":range==="past"?"No jobs were scheduled in the previous 30 days.":"No jobs are scheduled for this business day."}/>}
  </Screen></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},messages:{borderWidth:1,borderColor:colors.blue,borderRadius:10,padding:11,alignItems:"center"},messagesText:{fontWeight:"800",color:colors.blue},metrics:{flexDirection:"row",flexWrap:"wrap",gap:10},sectionHeading:{gap:3,marginTop:4},sectionTitle:{fontSize:20,fontWeight:"800",color:colors.navy},sectionDetail:{fontSize:14,color:colors.muted},notice:{fontSize:14,lineHeight:20,color:colors.muted,backgroundColor:colors.softBlue,borderRadius:10,padding:12},tabs:{flexDirection:"row",gap:8},tab:{flex:1,minHeight:42,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:colors.border,borderRadius:10,backgroundColor:colors.card},selectedTab:{backgroundColor:colors.blue,borderColor:colors.blue},tabText:{fontWeight:"800",color:colors.navy},selectedTabText:{color:"#fff"},group:{gap:10},groupTitle:{fontSize:16,fontWeight:"800",color:colors.muted}});
