import { FontAwesome6 } from '@expo/vector-icons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useUnistyles } from 'react-native-unistyles';
import { IconSymbol } from './ui/fonts/IconSymbol';


import { useSegments } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';

export default function PersonalAppTabs() {
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const segments = useSegments();

  const isTabBarHidden = Platform.select({
    web: width > 800 || segments.at(1) === 'chat',
    default: segments.at(1) === 'chat',
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
      <NativeTabs.Trigger name="chat" hidden />

      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={{
            default: <IconSymbol name="house.line" size={25} color={theme.colors.icon} />,
            selected: <IconSymbol name="house.fill" size={25} color={theme.colors.primary} />
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="contacts">
        <NativeTabs.Trigger.Label>Contacts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={{
            default: <FontAwesome6 size={25} name="contact-book" color={theme.colors.icon} />,
            selected: <FontAwesome6 size={25} name="contact-book" color={theme.colors.primary} />
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={{
            default: <IconSymbol size={25} name="person.line" color={theme.colors.icon} />,
            selected: <IconSymbol size={25} name="person.fill" color={theme.colors.primary} />
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>




    </NativeTabs>
  );
}
