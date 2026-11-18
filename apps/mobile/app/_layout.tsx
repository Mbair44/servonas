import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function RootLayout() {
  const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30_000}}}));return <QueryClientProvider client={client}><Stack screenOptions={{ headerShown:false }}/></QueryClientProvider>;
}
