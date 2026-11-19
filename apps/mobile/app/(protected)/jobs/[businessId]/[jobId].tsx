import { ActivityIndicator, Alert, Linking, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { addJobNote, jobDetail, mobileMe } from "../../../../lib/api";
import { mobileMeQueryKey, tenantQueryKey } from "../../../../lib/queryState";
import { ErrorState, LoadingState, Screen, StatusBadge, colors } from "../../../../components/mobile-ui";
import { statusLabel, timeLabel } from "../../../../lib/presentation";

function noteRequestUuid(){
  if(typeof globalThis.crypto?.randomUUID==="function")return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);
  globalThis.crypto?.getRandomValues(bytes);
  if(!bytes.some(Boolean))throw new Error("Secure note IDs are unavailable. Update the Servonas app and try again.");
  bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export default function JobDetail(){
  const {businessId,jobId}=useLocalSearchParams<{businessId:string;jobId:string}>(),router=useRouter(),queryClient=useQueryClient();
  const [note,setNote]=useState(""),noteRequestId=useRef<string|null>(null);
  const me=useQuery({queryKey:mobileMeQueryKey(),queryFn:({signal})=>mobileMe(signal),retry:1});
  const detailKey=tenantQueryKey(me.data?.user.id??"pending",businessId,"job",jobId);
  const detail=useQuery({queryKey:detailKey,queryFn:({signal})=>jobDetail(businessId,jobId,signal),enabled:!!businessId&&!!jobId&&!!me.data?.user.id,retry:(attempt,error:any)=>error?.status===401||error?.status===403||error?.status===404?false:attempt<1});
  const noteMutation=useMutation({
    mutationFn:async()=>{
      const body=note.trim();
      if(!body)throw new Error("Enter a note before saving.");
      // Keep this UUID for every retry of the same text. It is discarded only
      // after success or a deliberate text change.
      noteRequestId.current??=noteRequestUuid();
      return addJobNote(businessId,jobId,{body,idempotencyKey:noteRequestId.current});
    },
    retry:false,
    onSuccess:async()=>{
      setNote("");
      noteRequestId.current=null;
      await queryClient.invalidateQueries({queryKey:detailKey});
    },
  });
  // A route may be reused while a user switches workspace or account. Local
  // mutation state must never cross that authorization boundary.
  useEffect(()=>{
    noteMutation.reset();
    noteRequestId.current=null;
    setNote("");
  },[businessId,jobId,me.data?.user.id]);
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
    <Section label="Assignment"><Text style={styles.detail}>{data.assignment.role==="primary"?"Primary technician":"Helper technician"}</Text><Text style={styles.muted}>{data.assignment.allowedActions.length?`Available actions: ${data.assignment.allowedActions.map(action=>action.replaceAll("_"," ")).join(", ")}.`:"Read-only details"}</Text></Section>
    <Section label="Job notes">
      {data.notes.length?data.notes.map(item=><View style={styles.note} key={item.id}><Text style={styles.noteAuthor}>{item.authorName}</Text><Text style={styles.noteBody}>{item.body}</Text><Text style={styles.muted}>{timeLabel(item.createdAt)}</Text></View>):<Text style={styles.muted}>No job notes yet.</Text>}
      {data.assignment.allowedActions.includes("add_note")?<View style={styles.composer}>
        <TextInput accessibilityLabel="Add technician note" multiline maxLength={4000} editable={!noteMutation.isPending} onChangeText={(value)=>{if(value!==note)noteRequestId.current=null;setNote(value);}} placeholder="Add technician note" placeholderTextColor={colors.muted} style={styles.noteInput} value={note}/>
        {noteMutation.isError?<Text accessibilityLiveRegion="polite" style={styles.error}>{noteMutation.error instanceof Error?noteMutation.error.message:"The note could not be saved."}</Text>:null}
        <Pressable accessibilityRole="button" disabled={!note.trim()||noteMutation.isPending} onPress={()=>noteMutation.mutate()} style={[styles.noteButton,(!note.trim()||noteMutation.isPending)&&styles.disabled]}>{noteMutation.isPending?<ActivityIndicator color="#fff"/>:<Text style={styles.noteButtonText}>{noteMutation.isError?"Retry note":"Add note"}</Text>}</Pressable>
      </View>:null}
    </Section>
  </Screen></SafeAreaView>;
}
function Section({label,children}:{label:string;children:React.ReactNode}){return <View style={styles.section}><Text style={styles.label}>{label}</Text>{children}</View>;}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},back:{minHeight:44,justifyContent:"center",alignSelf:"flex-start"},backText:{color:colors.blue,fontSize:16,fontWeight:"800"},hero:{backgroundColor:colors.card,borderRadius:16,borderWidth:1,borderColor:colors.border,padding:18,gap:7},heroTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},number:{fontSize:13,fontWeight:"800",color:colors.muted},title:{fontSize:27,lineHeight:33,fontWeight:"800",color:colors.navy},service:{fontSize:15,color:colors.muted},section:{backgroundColor:colors.card,borderRadius:16,borderWidth:1,borderColor:colors.border,padding:17,gap:7},label:{fontSize:13,fontWeight:"800",letterSpacing:.6,textTransform:"uppercase",color:colors.muted},detail:{fontSize:16,lineHeight:23,color:colors.navy},muted:{fontSize:14,lineHeight:20,color:colors.muted},link:{fontSize:16,lineHeight:23,fontWeight:"700",color:colors.blue},note:{borderTopWidth:1,borderColor:colors.border,paddingTop:10,gap:4},noteAuthor:{fontSize:15,fontWeight:"800",color:colors.navy},noteBody:{fontSize:15,lineHeight:22,color:colors.navy},composer:{gap:10,paddingTop:8},noteInput:{minHeight:92,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,textAlignVertical:"top",fontSize:16,lineHeight:22,color:colors.navy},noteButton:{minHeight:44,alignItems:"center",justifyContent:"center",backgroundColor:colors.blue,borderRadius:10,paddingHorizontal:16},noteButtonText:{color:"#fff",fontWeight:"800",fontSize:16},disabled:{opacity:.55},error:{fontSize:14,lineHeight:20,color:"#b42318"}});
