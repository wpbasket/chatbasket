import TabBarBackground from '@/components/ui/common/TabBarBackground';
import { TabBarButton } from '@/components/ui/common/TabBarButton';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { Colors } from '@/constants/Colors';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

export default function TabLayout() {
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.light.tabIconSelected,
        headerShown: false,

        tabBarButton: TabBarButton,
        tabBarBackground: TabBarBackground,
        tabBarLabelStyle: {
          fontFamily: Platform.select({
            ios: 'Gantari-Regular',
            android: 'Gantari400',
            default: 'Gantari400,arial',
          }),
          // letterSpacing:0.5
        },
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          web: {
            display: width > 800 ? 'none' : 'flex'
          },
          // web:{
          //   backgroundColor: 'var(--app-bg)',    
          // },
          default: { backgroundColor: theme.colors.background },
        }),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={25}
              name={focused ? "house.fill" : "house.line"}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcon
              size={25}
              name={focused ? "magnify.scan" : "magnify.scan"}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={25}
              name={focused ? "person.fill" : "person.line"}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
