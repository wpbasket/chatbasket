import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useUnistyles } from 'react-native-unistyles';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, useWindowDimensions } from 'react-native';

export default function PublicAppTabs() {
    const { theme } = useUnistyles();
    const { width } = useWindowDimensions();

    const isTabBarHidden = Platform.select({
        web: width > 800
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
                    renderingMode="original"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="explore">
                <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="search" />}
                    selectedColor={theme.colors.primary}
                    renderingMode="original"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="profile">
                <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="person-outline" />}
                    selectedColor={theme.colors.primary}
                    renderingMode="original"
                />
            </NativeTabs.Trigger>

        </NativeTabs>
    );
}
