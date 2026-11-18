import * as SecureStore from "expo-secure-store";
const workspaceKey="servonas.mobile.workspace",experienceKey="servonas.mobile.experience";
export type Experience="office"|"technician";
export const preferences={workspace:()=>SecureStore.getItemAsync(workspaceKey),setWorkspace:(id:string)=>SecureStore.setItemAsync(workspaceKey,id),experience:()=>SecureStore.getItemAsync(experienceKey),setExperience:(value:Experience)=>SecureStore.setItemAsync(experienceKey,value),clearExperience:()=>SecureStore.deleteItemAsync(experienceKey),clear:()=>Promise.all([SecureStore.deleteItemAsync(workspaceKey),SecureStore.deleteItemAsync(experienceKey)])};
