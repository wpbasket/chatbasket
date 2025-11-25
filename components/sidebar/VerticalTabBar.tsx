import { IconSymbol } from '@/components/ui/fonts/IconSymbol'
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons'
import { appMode$ } from '@/state/appMode/state.appMode'
import { useValue } from '@legendapp/state/react'
import { Href, useRouter, useSegments } from "expo-router"
import { Pressable } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { ThemedText } from "../ui/common/ThemedText"
import { ThemedView } from "../ui/common/ThemedView"
import FontAwesome6 from '@expo/vector-icons/FontAwesome6'

const publicTabs = [
  {
    label: "Home",
    slug: "home",
    href: "/(tabs)/home",
    icon: (color: string) => (
      <IconSymbol
        size={20}
        name="house.fill" 
        color={color}
      />
    )
  },
  {
    label: "Explore",
    slug: "explore",
    href: "/(tabs)/explore",
    icon: (color: string) => (
      <MaterialCommunityIcon
        size={20}
        name="magnify.scan"
        color={color}
      />
    )
  },
  {
    label: "Profile",
    slug: "profile",
    href: "/(tabs)/profile",
    icon: (color: string, focused: boolean) => (
      <IconSymbol
        size={20}
        name={focused ? "person.fill" : "person.line"}
        color={color}
      />
    )
  },
] as const

const personalTabs = [
  {
    label: "Home",
    slug: "home",
    href: "/personal/home",
    icon: (color: string) => (
      <IconSymbol
        size={20}
        name="house.fill"
        color={color}
      />
    )
  },
  {
    label: "Contacts",
    slug: "contacts",
    href: "/personal/contacts",
    icon: (color: string) => (
      <FontAwesome6
        size={20}
        name="contact-book"
        color={color}
      />
    )
  },
  {
    label: "Profile",
    slug: "profile",
    href: "/personal/profile",
    icon: (color: string, focused: boolean) => (
      <IconSymbol
        size={20}
        name={focused ? "person.fill" : "person.line"}
        color={color}
      />
    )
  },
] as const

export default function VerticalTabBar() {
  const router = useRouter()
  const segments = useSegments()
  const mode = useValue(appMode$.mode)

  return (
    <ThemedView style={styles.sidebar}>
      {(mode === 'public' ? publicTabs : personalTabs).map((tab) => {
        let isActive = false

        isActive = segments.at(1) === tab.slug

        const iconColor = isActive ? styles.activeTabText.color : styles.tabText.color

        return (
          <Pressable
            key={tab.href}
            onPress={() => router.push(tab.href as Href)}
            style={({ pressed }) => [
              styles.tabItem,
              isActive && styles.activeTab,
              pressed && { opacity: 0.1 },
            ]}
          >
            <ThemedView style={styles.tabContent}>
              {tab.icon(iconColor, isActive)}
              <ThemedText style={[styles.tabText, isActive && styles.activeTabText]} selectable={false}>
                {tab.label}
              </ThemedText>
            </ThemedView>
          </Pressable>
        )
      })}
    </ThemedView>
  )
}

const styles = StyleSheet.create((theme) => ({
  sidebar: {
    flexDirection: "column",
    padding: 12,
    paddingTop: 5,
    gap: 5
  },
  tabItem: {
    paddingVertical: 6,
    paddingRight: 10,
    paddingLeft:15,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 10,
    borderTopRightRadius: 35,
  },
  activeTab: {
    backgroundColor: theme.colors.neutral0,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  tabText: {
    fontSize: 16,
    letterSpacing: 0.5,
    color: theme.colors.text,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: "bold",
  },

}))
