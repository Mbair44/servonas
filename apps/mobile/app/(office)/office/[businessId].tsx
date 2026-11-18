import { SafeAreaView, StyleSheet, Text, View } from "react-native";
// The group keeps office-only routes separate without changing the public path.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { mobileMe, ownerManagerHome } from "../../../lib/api";
import { mobileMeQueryKey, tenantQueryKey } from "../../../lib/queryState";
import { AppHeader, EmptyState, ErrorState, JobCard, LoadingState, Metric, Screen, colors } from "../../../components/mobile-ui";

export default function OfficeHome(){
  const {businessId}=useLocalSearchParams<{businessId:string}>(), router=useRouter();
  const me=useQuery({queryKey:mobileMeQueryKey(),queryFn:({signal})=>mobileMe(signal),retry:1});
  const workspace=me.data?.workspaces.find(item=>item.id===businessId), eligible=!!workspace?.availableCapabilities.includes("operational_dashboard");
  const home=useQuery({queryKey:tenantQueryKey(me.data?.user.id??"pending",businessId,"owner-home"),queryFn:({signal})=>ownerManagerHome(businessId,signal),enabled:!!businessId&&!!me.data?.user.id&&eligible,retry:(attempt,error:any)=>error?.status===401||error?.status===403||error?.status===404?false:attempt<1});
  if(me.isLoading||home.isLoading)return <SafeAreaView style={styles.safe}><LoadingState/></SafeAreaView>;
  if(me.isError||home.isError)return <SafeAreaView style={styles.safe}><Screen><AppHeader title="Office home" onSettings={()=>router.replace("/")}/><ErrorState message={(home.error??me.error as Error)?.message??"Please check your connection."} onRetry={()=>{void me.refetch();void home.refetch();}}/></Screen></SafeAreaView>;
  if(!eligible)return <SafeAreaView style={styles.safe}><Screen><AppHeader title="Office home" onSettings={()=>router.replace("/")}/><ErrorState message="Office access is unavailable for this workspace." onRetry={()=>router.replace("/")}/></Screen></SafeAreaView>;
  const data=home.data!;
  return <SafeAreaView style={styles.safe}><Screen refreshing={home.isFetching} onRefresh={()=>home.refetch()}>
    <AppHeader title="Today" subtitle={`${data.workspace.displayName} · ${data.operational.asOfDate}`} onSettings={()=>router.replace("/")}/>
    <View style={styles.metrics}><Metric value={data.operational.jobsToday} label="Jobs today" accent/><Metric value={data.operational.inProgressJobs} label="In progress"/><Metric value={data.operational.unassignedJobs} label="Unassigned"/><Metric value={data.operational.techniciansWorking} label="Technicians working"/></View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Today’s schedule</Text><Text style={styles.sectionDetail}>{data.operational.pendingBookings} pending booking{data.operational.pendingBookings===1?"":"s"}</Text></View>
    {data.operational.todayJobs.length?data.operational.todayJobs.map(job=><JobCard key={job.id} job={job} onPress={()=>router.push({pathname:"/jobs/[businessId]/[jobId]",params:{businessId,jobId:job.id}})}/>):<EmptyState title="No jobs scheduled today" detail="New jobs scheduled for this business day will appear here."/>}
  </Screen></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},metrics:{flexDirection:"row",flexWrap:"wrap",gap:10},sectionHeading:{gap:3,marginTop:4},sectionTitle:{fontSize:20,fontWeight:"800",color:colors.navy},sectionDetail:{fontSize:14,color:colors.muted}});
