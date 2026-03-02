import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useUnistyles } from 'react-native-unistyles';

import { useSegments } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';

export default function PersonalAppTabs() {
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const segments = useSegments();

  const isTabBarHidden = Platform.select({
    web: width > 800 || segments.at(2) === 'chat',
    default: segments.at(2) === 'chat',
  });

  return (
    <NativeTabs
      hidden={isTabBarHidden}
      backgroundColor={theme.colors.background}
      indicatorColor={theme.colors.backgroundElement}
      rippleColor="transparent"
      disableIndicator={true}
      labelStyle={{
        default: {
          fontFamily: Platform.select({
            ios: 'Gantari-Regular',
            android: 'Gantari400',
            default: 'Gantari400,arial',
          }),
        },
        selected: { color: theme.colors.primary }
      }}>
      <NativeTabs.Trigger name="index" hidden />
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="home" />}
          selectedColor={theme.colors.primary}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="contacts">
        <NativeTabs.Trigger.Label>Contacts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={FontAwesome6} name="contact-book" />}
          selectedColor={theme.colors.primary}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="person-outline" />}
          selectedColor={theme.colors.primary}
        />
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
