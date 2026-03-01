import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import {
    TabList,
    TabListProps,
    Tabs,
    TabSlot,
    TabTrigger,
    TabTriggerSlotProps,
} from 'expo-router/ui';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { Spacing } from '@/constants/theme';
import React from 'react';
import { StyleSheet } from 'react-native-unistyles';
import { ThemedText } from './ui/basic';
import { IconSymbol } from './ui/fonts/IconSymbol';

const TAB_CONFIG = [
    {
        name: 'home',
        href: '/public/home' as const,
        label: 'Home',
        icon: (focused: boolean, color: string) => <IconSymbol name={focused ? 'house.fill' : 'house.fill'} size={25} color={color} />
    },
    {
        name: 'explore',
        href: '/public/explore' as const,
        label: 'Explore',
        icon: (focused: boolean, color: string) => <MaterialCommunityIcon name={focused ? "magnify.scan" : "magnify.scan"} size={25} color={color} />
    },
    {
        name: 'profile',
        href: '/public/profile' as const,
        label: 'Profile',
        icon: (focused: boolean, color: string) => <IconSymbol name={focused ? 'person.fill' : 'person.line'} size={25} color={color} />
    },
];

export default function PublicAppTabs() {
    return (
        <Tabs>
            <TabSlot style={{ height: '100%' }} />
            <TabList asChild>
                <CustomTabList>
                    <TabTrigger name="index" href="/public" asChild>
                        <View style={{ display: 'none' }} />
                    </TabTrigger>
                    {TAB_CONFIG.map(tab => (
                        <TabTrigger key={tab.name} name={tab.name} href={tab.href as any} asChild>
                            <TabButton icon={tab.icon}>{tab.label}</TabButton>
                        </TabTrigger>
                    ))}
                </CustomTabList>
            </TabList>
        </Tabs>
    );
}

export function TabButton({
    children,
    isFocused,
    icon,
    ...props
}: TabTriggerSlotProps & { icon?: (focused: boolean, color: string) => React.ReactNode }) {
    const { theme } = useUnistyles();
    const contentColor = isFocused ? theme.colors.primary : theme.colors.icon;

    return (
        <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
            <View style={styles.tabButtonView}>
                {icon?.(!!isFocused, contentColor)}
                <ThemedText style={{ color: contentColor, fontSize: 12 }}>
                    {children}
                </ThemedText>
            </View>
        </Pressable>
    );
}

export function CustomTabList(props: TabListProps) {
    const { width } = useWindowDimensions();
    const { theme } = useUnistyles();

    const isTabBarHidden = Platform.select({
        web: width > 800
    });

    return (
        <View {...props} style={[styles.tabListContainer, isTabBarHidden && { display: 'none' }, { borderTopColor: theme.colors.border }]}>
            <View style={[styles.innerContainer, { backgroundColor: theme.colors.background }]}>
                {props.children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    tabListContainer: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    innerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: Spacing.two,
        paddingHorizontal: Spacing.three,
    },
    pressed: {
        opacity: 0.1,
    },
    tabButtonView: {
        flexDirection: 'row',
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.three,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
});
