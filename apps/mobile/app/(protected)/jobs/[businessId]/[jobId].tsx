import { Alert, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { jobDetail, mobileMe } from "../../../../lib/api";
import { mobileMeQueryKey, tenantQueryKey } from "../../../../lib/queryState";
import { ErrorState, LoadingState, Screen, StatusBadge, colors } from "../../../../components/mobile-ui";
import { statusLabel, timeLabel } from "../../../../lib/presentation";

export default function JobDetail(){
  const {businessId,jobId}=useLocalSearchParams<{businessId:string;jobId:string}>(),router=useRouter();
  const me=useQuery({queryKey:mobileMeQueryKey(),queryFn:({signal})=>mobileMe(signal),retry:1});
  const detail=useQuery({queryKey:tenantQueryKey(me.data?.user.id??"pending",businessId,"job",jobId),queryFn:({signal})=>jobDetail(businessId,jobId,signal),enabled:!!businessId&&!!jobId&&!!me.data?.user.id,retry:(attempt,error:any)=>error?.status===401||error?.status===403||error?.status===404?false:attempt<1});
  if(me.isLoading||detail.isLoading)return <SafeAreaView style={styles.safe}><LoadingState/></SafeAreaView>;
  if(me.isError||detail.isError)return <SafeAreaView style={styles.safe}><Screen><Pressable accessibilityRole="button" onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable><ErrorState message={(detail.error??me.error as Error)?.status===404?"This job is unavailable or you no longer have access.":(detail.error??me.error as Error)?.message??"This job could not be loaded."} onRetry={()=>{void me.refetch();void detail.refetch();}}/></Screen></SafeAreaView>;
  const data=detail.data!,job=data.job,open=(url:string)=>Linking.openURL(url).catch(()=>Alert.alert("Unable to open link"));
  return <SafeAreaView style={styles.safe}><Screen refreshing={detail.isFetching} onRefresh={()=>detail.refetch()}>
    <Pressable accessibilityRole="button" onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>‹ Back to jobs</Text></Pressable>
    <View style={styles.hero}><View style={styles.heroTop}><Text style={styles.number}>JOB #{job.jobNumber}</Text><StatusBadge status={job.status}/></View><Text style={styles.title}>{job.title}</Text><Text style={styles.service}>{job.service?.name??"Service details"}</Text></View>
    <Section label="Schedule"><Text style={styles.detail}>{timeLabel(job.startsAt)}</Text>{job.endsAt?<Text style={styles.muted}>Ends {timeLabel(job.endsAt)}</Text>:null}{job.arrivalWindowStart&&job.arrivalWindowEnd?<Text style={styles.muted}>Arrival window: {timeLabel(job.arrivalWindowStart)} – {timeLabel(job.arrivalWindowEnd)}</Text>:null}</Section>
    {job.customer?<Section label="Customer"><Text style={styles.detail}>{job.customer.displayName}</Text>{job.customer.phone?<Pressable accessibilityRole="link" onPress={()=>open(`tel:${job.customer!.phone}`)}><Text style={styles.link}>{job.customer.phone}</Text></Pressable>:<Text style={styles.muted}>No phone number on file</Text>}</Section>:null}
    {job.serviceAddress?<Section label="Service address"><Pressable accessibilityRole="link" onPress={()=>open(`https://maps.apple.com/?q=${encodeURIComponent(job.serviceAddress!)}`)}><Text style={styles.link}>{job.serviceAddress}</Text></Pressable></Section>:null}
    {job.description?<Section label="Instructions"><Text style={styles.detail}>{job.description}</Text></Section>:null}
    <Section label="Assignment"><Text style={styles.detail}>{data.assignment.role==="primary"?"Primary technician":"Helper technician"}</Text><Text style={styles.muted}>{data.assignment.allowedActions.length?`Available actions: ${data.assignment.allowedActions.map(action=>action.replaceAll("_"," ")).join(", ")}. Actions are not available in this read-only release.`:"Read-only details"}</Text></Section>
  </Screen></SafeAreaView>;
}
function Section({label,children}:{label:string;children:React.ReactNode}){return <View style={styles.section}><Text style={styles.label}>{label}</Text>{children}</View>;}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},back:{minHeight:44,justifyContent:"center",alignSelf:"flex-start"},backText:{color:colors.blue,fontSize:16,fontWeight:"800"},hero:{backgroundColor:colors.card,borderRadius:16,borderWidth:1,borderColor:colors.border,padding:18,gap:7},heroTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},number:{fontSize:13,fontWeight:"800",color:colors.muted},title:{fontSize:27,lineHeight:33,fontWeight:"800",color:colors.navy},service:{fontSize:15,color:colors.muted},section:{backgroundColor:colors.card,borderRadius:16,borderWidth:1,borderColor:colors.border,padding:17,gap:7},label:{fontSize:13,fontWeight:"800",letterSpacing:.6,textTransform:"uppercase",color:colors.muted},detail:{fontSize:16,lineHeight:23,color:colors.navy},muted:{fontSize:14,lineHeight:20,color:colors.muted},link:{fontSize:16,lineHeight:23,fontWeight:"700",color:colors.blue}});
