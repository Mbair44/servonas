import { StyleSheet, Text, View } from "react-native";

export default function FoundationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Servonas</Text>
      <Text style={styles.body}>Mobile foundation is ready for Phase 1 APIs.</Text>
    </View>
  );
}

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
});
