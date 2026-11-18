import { useEffect, useState } from "react";
import { ActivityIndicator, Button, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { mobileMe } from "../lib/api";
import { preferences, type Experience } from "../lib/preferences";
import { allowedExperiences, selectedExperience, selectedWorkspace } from "../lib/navigation";
import { clearForAccountChange, clearForExperienceChange, clearForWorkspaceChange, mobileMeQueryKey, refreshAuthorizedWorkspaces } from "../lib/queryState";

export default function FoundationScreen() {
  const [session, setSession] = useState<any>();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [savedWorkspace, setSavedWorkspace] = useState<string | null>(null);
  const [savedExperience, setSavedExperience] = useState<string | null>(null);
  const client = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    Promise.all([supabase.auth.getSession(), preferences.workspace(), preferences.experience()]).then(([{ data }, workspace, experience]) => {
      setSession(data.session);
      setSavedWorkspace(workspace);
      setSavedExperience(experience);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      clearForAccountChange(client);
      if (!next) {
        setSavedWorkspace(null);
        setSavedExperience(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  const me = useQuery({
    queryKey: mobileMeQueryKey(session?.user.id),
    queryFn: ({ signal }) => mobileMe(signal),
    enabled: !!session,
    retry: (count, requestError: any) => requestError?.status === 401 ? false : count < 1,
  });
  const workspaces = me.data?.workspaces ?? [];
  const workspace = selectedWorkspace(workspaces, savedWorkspace);
  const experience = workspace ? selectedExperience(workspace, savedExperience) : null;

  // A stored choice is only a preference. Reconcile it against the latest
  // server-authorized workspace list after sign-in or a /me refresh.
  useEffect(() => {
    if (!session || !workspace || me.isLoading || me.isError) return;
    if (savedWorkspace !== workspace.id) {
      setSavedWorkspace(workspace.id);
      void preferences.setWorkspace(workspace.id);
    }
    if (savedExperience !== experience) {
      setSavedExperience(experience);
      void (experience ? preferences.setExperience(experience) : preferences.clearExperience());
    }
  }, [experience, me.isError, me.isLoading, savedExperience, savedWorkspace, session, workspace]);

  if (!ready) return <Center text="Restoring secure session…" />;
  if (!session) return <Login email={email} password={password} error={error} onEmail={setEmail} onPassword={setPassword} onError={setError} />;
  if (me.isLoading) return <Center text="Loading workspaces…" />;
  if (me.isError) return <ErrorState message={(me.error as Error).message} onRetry={() => me.refetch()} />;
  if (!workspaces.length || !workspace) return <NoWorkspace />;

  const experiences = allowedExperiences(workspace);
  const switchWorkspace = async (id: string) => {
    if (id === workspace.id || !workspaces.some((item) => item.id === id)) return;
    // All future tenant-scoped query keys must start with "tenant".
    clearForWorkspaceChange(client);
    setSavedWorkspace(id);
    setSavedExperience(null);
    await Promise.all([preferences.setWorkspace(id), preferences.clearExperience()]);
    await refreshAuthorizedWorkspaces(client, session.user.id);
  };
  const switchExperience = async (value: Experience) => {
    if (!experiences.includes(value)) return;
    if (value !== experience) clearForExperienceChange(client);
    setSavedExperience(value);
    await preferences.setExperience(value);
  };
  const openExperience = () => {
    if (experience === "office") router.push({ pathname: "/office/[businessId]", params: { businessId: workspace.id } });
    if (experience === "technician") router.push({ pathname: "/technician/[businessId]", params: { businessId: workspace.id } });
  };
  const homeLabel = experience === "office"
    ? "Office experience selected."
    : experience === "technician"
      ? "Technician experience selected."
      : "This workspace has no mobile experience available for this account.";

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{workspace.displayName}</Text>
      <Text style={styles.sectionTitle}>Workspace</Text>
      {workspaces.length > 1 && <View style={styles.list}>{workspaces.map((item) => {
        const selected = item.id === workspace.id;
        return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => switchWorkspace(item.id)} style={[styles.choice, selected && styles.choiceSelected]}>
          <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{item.displayName}</Text>
        </Pressable>;
      })}</View>}
      <Text style={styles.sectionTitle}>Experience</Text>
      {experiences.length ? <View style={styles.list}>{experiences.map((item) => {
        const selected = item === experience;
        return <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => switchExperience(item)} style={[styles.choice, selected && styles.choiceSelected]}>
          <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>Use {item} experience</Text>
        </Pressable>;
      })}</View> : <Text style={styles.body}>No office or technician experience is assigned to this workspace.</Text>}
      <Text style={styles.body}>{homeLabel}</Text>
      <Text style={styles.body}>Connection verified: {workspaces.length} workspace(s)</Text>
      {experience && <Pressable accessibilityRole="button" onPress={openExperience} style={styles.openDashboard}><Text style={styles.openDashboardText}>Open {experience} home</Text></Pressable>}
      <Button title="Refresh" onPress={() => me.refetch()} />
      <Button title="Sign out" onPress={async () => { clearForAccountChange(client); await preferences.clear(); await supabase.auth.signOut(); }} />
    </ScrollView>
  </SafeAreaView>;
}

function Login({ email, password, error, onEmail, onPassword, onError }: { email: string; password: string; error?: string; onEmail: (value: string) => void; onPassword: (value: string) => void; onError: (value?: string) => void }) {
  return <SafeAreaView style={styles.container}>
    <Text style={styles.title}>Servonas</Text>
    <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={onEmail} />
    <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={onPassword} />
    {error && <Text>{error}</Text>}
    <Button title="Sign in" onPress={async () => {
      onError(undefined);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) onError("Sign-in failed. Check your email and password.");
    }} />
  </SafeAreaView>;
}

function Center({ text }: { text: string }) { return <View style={styles.container}><ActivityIndicator /><Text>{text}</Text></View>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <SafeAreaView style={styles.container}><Text>{message}</Text><Button title="Retry" onPress={onRetry} /><Button title="Sign out" onPress={() => supabase.auth.signOut()} /></SafeAreaView>; }
function NoWorkspace() { return <SafeAreaView style={styles.container}><Text style={styles.title}>No workspace access</Text><Text style={styles.body}>You are signed in, but this account has no active Servonas membership.</Text><Button title="Sign out" onPress={() => supabase.auth.signOut()} /></SafeAreaView>; }

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  content: { padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: "700" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  body: { marginTop: 12, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, width: "100%" },
  list: { width: "100%", gap: 8 },
  choice: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  choiceSelected: { borderColor: "#2563eb", backgroundColor: "#dbeafe" },
  choiceText: { fontSize: 16 },
  choiceTextSelected: { fontWeight: "700", color: "#1d4ed8" },
  openDashboard: { alignItems: "center", backgroundColor: "#2563eb", borderRadius: 10, justifyContent: "center", minHeight: 48, marginTop: 8 },
  openDashboardText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
