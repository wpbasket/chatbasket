import { StyleSheet } from 'react-native-unistyles'
import React from 'react'
import { ThemedView } from '@/components/ui/common/ThemedView';  
import { ThemedText } from '@/components/ui/common/ThemedText';  
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { pressableAnimation } from '@/hooks/pressableAnimation';
import currentUserStore from '@/state/publicState/activeUser.state';
import { User } from '@/model/User';
import users from '@/assets/data/users';

type Props = {
    follower: {
        id: string;
        username: string;
        first_name: string;
        last_name: string;
    };
    interactive?: boolean;
};

export default function FollowerCard({ follower, interactive }: Props) {
    const {handlePressIn } = pressableAnimation();
    const userInfo: User | undefined = users.find((x) => x.id === follower.id);
    const goToUserProfile = () => {
        // Navigate to the user's profile
        currentUserStore.user.set(userInfo ?? null); // Set the user in the store
        router.push(`/(temp)/tempprofile`);
    };
    return (
        <ThemedView style={styles.container}>
            {/* Profile Picture */}
            <ThemedView style={styles.userInfoContainer}>
                <ThemedView style={styles.profilePictureContainer}>
                    {/* Placeholder for profile picture */}
                    <Pressable
                        onPress={interactive ? goToUserProfile : undefined}
                        onPressIn={handlePressIn}
                        style={({ pressed }) => [
                            { opacity: pressed ? 0.1 : 1 },
                        ]}

                    >
                    <ThemedView style={styles.profilePicture} >
                        <ThemedText type='titleSmall'>{follower.first_name[0]}</ThemedText>
                    </ThemedView>
                    </Pressable>
                </ThemedView>
                {/* User Info */}
                <ThemedView style={styles.userDetailsContainer}>
                    <Pressable
                        onPress={interactive ? goToUserProfile : undefined}
                        onPressIn={handlePressIn}
                        style={({ pressed }) => [
                            { opacity: pressed ? 0.1 : 1 },
                        ]}

                    >
                        <ThemedText type='semibold'>
                            @{follower.username}
                        </ThemedText>
                    </Pressable>
                    <ThemedText type='small'>
                        {follower.first_name} {follower.last_name}
                    </ThemedText>
                </ThemedView>
            </ThemedView>

        </ThemedView>
    );

};

const styles = StyleSheet.create((theme) => ({
    container: {
        height: 51,
        // borderBottomWidth: 1,
        // borderBottomColor: theme.colors.neutral,
    },
    userInfoContainer: {
        height: 50,
        flexDirection: 'row',
        gap: 8,
        paddingLeft: 12
    },
    profilePictureContainer: {
        height: 50,
        width: 35,
        justifyContent: 'center',
        // alignItems: 'center',
    },
    profilePicture: {
        height: 35,
        width: 35,
        backgroundColor: theme.colors.primary,
        borderRadius: 9999,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userDetailsContainer: {
        height: 50,
        justifyContent: 'center',
    },
}));