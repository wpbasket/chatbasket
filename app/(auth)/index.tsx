import ParallaxScrollView from "@/components/ui/common/ParallaxScrollView";
import { ThemedText } from "@/components/ui/common/ThemedText";
import { IconSymbol } from "@/components/ui/fonts/IconSymbol";
import { pressableAnimation } from "@/hooks/pressableAnimation";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useEffect, useState } from "react";

export default function Index() {
  const uniS = useUnistyles()
  const { handlePressIn } = pressableAnimation();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) return null;

  return (
    <>
      <StatusBar style="dark" />
      <ParallaxScrollView>
        <View style={styles.container}>
          <View style={styles.headerContainer}>
            <ThemedText type="logo" style={styles.logo}>
              ChatBasket
            </ThemedText>
            <ThemedText type="subtitle" style={styles.tagline}>
              BUILT TO CONNECT AND {'\n'}DESIGNED TO SCALE
            </ThemedText>
          </View>

          <View style={styles.buttonsContainer}>
            <View style={styles.buttonView}>
              <ThemedText type="title" style={styles.authText} selectable={false}>Login</ThemedText>
              <Pressable
                onPressIn={handlePressIn}
                onPress={() => router.push({ pathname: '/auth', params: { method: 'login' } })}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.1 : 1 },]}
              >
                <View style={styles.buttonIcon}>
                  <IconSymbol name='account.login' color={uniS.theme.colors.primary} size={75}></IconSymbol>
                </View>
              </Pressable>
            </View>

            <View style={styles.buttonView} >
              <ThemedText type="title" style={styles.authText} selectable={false}>Signup</ThemedText>
              <Pressable
                onPressIn={handlePressIn}
                onPress={() => router.push({ pathname: '/auth', params: { method: 'signup' } })}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.1 : 1 },]}
              >
                <View style={styles.buttonIcon}>
                  <IconSymbol name='account.add' color={uniS.theme.colors.primary} size={70}></IconSymbol>
                </View>
              </Pressable>
            </View>
            {Platform.OS === 'web' && (
              <View style={styles.footer}>
                <ThemedText color={uniS.theme.colors.lightbackgroundText}>© ChatBasket 2025, All rights reserved.</ThemedText>
              </View>
            )}
          </View>
        </View>
      </ParallaxScrollView>
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    paddingTop: rt.insets.top + 20,
    backgroundColor: 'white',
    // padding: 10,
    justifyContent: "space-between",
    // paddingTop: 20,
    // paddingBottom: 20,
  },
  headerContainer: {
    // alignItems: "center",
    padding: 10,
    gap: 5,
  },
  logo: {
    fontSize: 48,
    lineHeight: 35,
    color: theme.colors.primary,
  },
  tagline: {
    fontSize: 62,
    color: '#2C3E50',
    marginTop: 10,
    letterSpacing: 2,
    lineHeight: 60,
  },
  buttonsContainer: {
    gap: 10,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    backgroundColor: theme.colors.primary,
    paddingBottom: 20,
    paddingTop: 20,
  },
  buttonView: {
    height: 120,
    width: 340,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: "space-between",
    marginLeft: 20,

  },
  buttonIcon: {
    height: 100,
    borderRadius: 9999,
    backgroundColor: 'white',
    width: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authText: {
    fontSize: 60,
    lineHeight: 65,
    color: theme.colors.lightbackgroundText,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  }
}));