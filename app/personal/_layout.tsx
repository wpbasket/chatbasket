import TabBarBackground from '@/components/ui/common/TabBarBackground';
import { TabBarButton } from '@/components/ui/common/TabBarButton';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { Colors } from '@/constants/Colors';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { Tabs, useSegments } from 'expo-router';
import React from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { useUnistyles } from 'react-native-unistyles';
import { useEffect } from 'react';
import { $syncEngine } from '@/state/personalState/chat/personal.state.sync';
import { startWSEventBridge, stopWSEventBridge } from '@/state/personalState/chat/ws.event.bridge';
import { PersonalUtilRefreshDeviceStatus } from '@/utils/personalUtils/personal.util.device';

export default function PersonalTabLayout() {
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const segments = useSegments();

  useEffect(() => {
    setTimeout(() => {
      $syncEngine.catchUp();
    }, 3000);
    PersonalUtilRefreshDeviceStatus();

    // Start WebSocket real-time event bridge
    const wsTimer = setTimeout(() => {
      startWSEventBridge();
    }, 2000);

    return () => {
      clearTimeout(wsTimer);
      stopWSEventBridge();
    };
  }, []);

  return (
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
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
                display: width > 800 || segments.at(1) === 'chat' ? 'none' : 'flex'
              },
              // web:{
              //   backgroundColor: 'var(--app-bg)',    
              // },
              default: { backgroundColor: theme.colors.background, display: segments.at(1) === 'chat' ? 'none' : 'flex' },
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
              tabBarIcon: ({ color }) => (
                <IconSymbol
                  size={25}
                  name="house.fill"
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name='contacts'
            options={{
              title: 'Contacts',
              tabBarIcon: ({ color }) => (
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
          <Tabs.Screen
            name="chat"
            options={{
              href: null,
            }}
          />
        </Tabs>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  );
}
