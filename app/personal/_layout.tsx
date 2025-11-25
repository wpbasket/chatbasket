import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import TabBarBackground from '@/components/ui/common/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { TabBarButton } from '@/components/ui/common/TabBarButton';
import { useUnistyles } from 'react-native-unistyles';
import { useWindowDimensions } from 'react-native';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

export default function PersonalTabLayout() {
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
        name='contacts'
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6
              size={25}
              name="contact-book"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          // href:null,
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
