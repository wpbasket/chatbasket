
import { ThemedText } from "@/components/ui/basic"
import { ThemedView } from "@/components/ui/basic"
import { StyleSheet } from "react-native-unistyles"


export default function Explore() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText >Coming soon</ThemedText>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})