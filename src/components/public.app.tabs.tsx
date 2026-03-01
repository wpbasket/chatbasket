import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useUnistyles } from 'react-native-unistyles';
import { IconSymbol } from './ui/fonts/IconSymbol';

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
                    src={{
                        default: <IconSymbol name="house.line" size={25} color={theme.colors.icon} />,
                        selected: <IconSymbol name="house.fill" size={25} color={theme.colors.primary} />
                    }}
                    renderingMode="original"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="explore">
                <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    src={{
                        default: <MaterialCommunityIcon size={25} name="magnify.scan" color={theme.colors.icon} />,
                        selected: <MaterialCommunityIcon size={25} name="magnify.scan" color={theme.colors.primary} />
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
