import { SafeAreaView, StyleSheet, Text, View } from "react-native";
// The group keeps technician-only routes separate without changing the public path.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { mobileMe, technicianHome } from "../../../lib/api";
import { mobileMeQueryKey, tenantQueryKey } from "../../../lib/queryState";
import { AppHeader, EmptyState, ErrorState, JobCard, LoadingState, Screen, colors } from "../../../components/mobile-ui";

export default function TechnicianHome(){
  const {businessId}=useLocalSearchParams<{businessId:string}>(),router=useRouter();
  const me=useQuery({queryKey:mobileMeQueryKey(),queryFn:({signal})=>mobileMe(signal),retry:1});
  const workspace=me.data?.workspaces.find(item=>item.id===businessId), eligible=!!workspace?.technicianEligible;
  const home=useQuery({queryKey:tenantQueryKey(me.data?.user.id??"pending",businessId,"technician-home"),queryFn:({signal})=>technicianHome(businessId,signal),enabled:!!businessId&&!!me.data?.user.id&&eligible,retry:(attempt,error:any)=>error?.status===401||error?.status===403||error?.status===404?false:attempt<1});
  const go=(jobId:string)=>router.push({pathname:"/jobs/[businessId]/[jobId]",params:{businessId,jobId}});
  if(me.isLoading||home.isLoading)return <SafeAreaView style={styles.safe}><LoadingState/></SafeAreaView>;
  if(me.isError||home.isError)return <SafeAreaView style={styles.safe}><Screen><AppHeader title="My jobs" onSettings={()=>router.replace("/")}/><ErrorState message={(home.error??me.error as Error)?.message??"Please check your connection."} onRetry={()=>{void me.refetch();void home.refetch();}}/></Screen></SafeAreaView>;
  if(!eligible)return <SafeAreaView style={styles.safe}><Screen><AppHeader title="My jobs" onSettings={()=>router.replace("/")}/><ErrorState message="Technician access is unavailable for this workspace." onRetry={()=>router.replace("/")}/></Screen></SafeAreaView>;
  const data=home.data!, todayWithoutCurrent=data.todayJobs.filter(job=>job.id!==data.currentJob?.id);
  return <SafeAreaView style={styles.safe}><Screen refreshing={home.isFetching} onRefresh={()=>home.refetch()}>
    <AppHeader title="My jobs" subtitle={`${data.technician.displayName} · ${data.workspace.displayName}`} onSettings={()=>router.replace("/")}/>
    <Text style={styles.sectionTitle}>Current job</Text>
    {data.currentJob?<JobCard job={data.currentJob} onPress={()=>go(data.currentJob!.id)}/>:<EmptyState title="No job in progress" detail="When you are en route or working on an assigned job, it will appear here."/>}
    <Text style={styles.sectionTitle}>Today</Text>
    {todayWithoutCurrent.length?todayWithoutCurrent.map(job=><JobCard key={job.id} job={job} onPress={()=>go(job.id)}/>):<EmptyState title="No more jobs today" detail="Your assigned work for today is clear."/>}
    <Text style={styles.sectionTitle}>Upcoming</Text>
    {data.upcomingJobs.length?data.upcomingJobs.map(job=><JobCard key={job.id} job={job} onPress={()=>go(job.id)}/>):<EmptyState title="No upcoming assignments" detail="New assigned jobs will appear here."/>}
  </Screen></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},sectionTitle:{fontSize:20,fontWeight:"800",color:colors.navy,marginTop:4}});
