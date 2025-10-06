import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { pressableAnimation } from '@/hooks/pressableAnimation';
import { useLegend$ } from '@/hooks/useLegend';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Header from '@/components/header/Header';
import currentPostStore from '@/state/publicState/activePost.state';
import currentUserStore from '@/state/publicState/activeUser.state';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import Sidebar from '@/components/sidebar/Sidebar';

export default function PostDetailsPage() {
    const post = useLegend$(currentPostStore.post);
    const user = useLegend$(currentUserStore.user);
    const { handlePressIn } = pressableAnimation();


    const goToUserProfile = () => {
        router.push('/(temp)/tempprofile');
    };

    const goBack = () => {
        router.back();
    };


    if (!post || !user) {
        return (
            <ThemedView style={styles.notFound}>
                <ThemedText type='title'>No post found!</ThemedText>
            </ThemedView>
        );
    }

    return (
        <ThemedViewWithSidebar>
            <ThemedViewWithSidebar.Sidebar>
                <Sidebar />
            </ThemedViewWithSidebar.Sidebar>
            <ThemedViewWithSidebar.Main>
                <ThemedView style={styles.container}>
                    <ThemedView style={styles.mainContainer}>
                        <Header
                            leftButton={{
                                child: <IconSymbol name='arrow.left' />,
                                onPress: goBack,
                            }}
                            Icon={<ThemedText type='subtitle'>Post</ThemedText>}
                        />
                        <ThemedView style={styles.container}>
                            {/* User Info container */}
                            <ThemedView style={styles.userInfoContainer}>
                                <ThemedView style={styles.profilePictureContainer}>
                                    {/* Placeholder for profile picture */}
                                    <ThemedView style={styles.profilePicture}></ThemedView>
                                </ThemedView>
                                {/* User Info */}
                                <ThemedView style={styles.userDetailsContainer}>
                                    <ThemedText type='semibold' style={{ lineHeight: 16 }}>
                                        {user?.name}{'Dummy' + user?.username[0].toUpperCase()}
                                    </ThemedText>
                                    <Pressable
                                        onPress={goToUserProfile}
                                        onPressIn={handlePressIn}
                                        // android_ripple={styles.ripple}
                                        style={({ pressed }) => [
                                            { opacity: pressed ? 0.1 : 1 },
                                        ]}

                                    >
                                        <ThemedText type='small'>
                                            @{user?.username}
                                        </ThemedText>
                                    </Pressable>
                                </ThemedView>
                            </ThemedView>

                            {/* Post Content */}
                            <View style={styles.postContainer}>

                                <ThemedText>{post.content}</ThemedText>
                            </View>
                            {/* Bottom Container */}
                            <ThemedView style={styles.bottomContainer}>
                                <ThemedView style={styles.likeContainer}>
                                    <Pressable onPress={undefined}>
                                        <ThemedView style={styles.likeIcon}></ThemedView>
                                    </Pressable>
                                    <Pressable onPress={undefined}>
                                        <ThemedView style={styles.commentIcon}></ThemedView>
                                    </Pressable>
                                    <Pressable onPress={undefined}>
                                        <ThemedView style={styles.shareIcon}></ThemedView>
                                    </Pressable>
                                </ThemedView>
                            </ThemedView>



                        </ThemedView>
                    </ThemedView>
                </ThemedView>
            </ThemedViewWithSidebar.Main>
        </ThemedViewWithSidebar>
    );
}

const styles = StyleSheet.create((theme, rt) => ({
    notFound: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingRight: {
            xs: 0,
            sm: 0,
            md: 0,
            lg: 0,
            xl: 200,
            xl2: 400,
            superLarge: 500
          },
        paddingLeft: {
            xs: 0,
            sm: 0,
            md: 0,
            lg: 250,
        }
    },
    mainContainer: {
        flex: 1,
        paddingTop: rt.insets.top,
    },
    container: {
        height: 370,
    },
    userInfoContainer: {
        height: 50,
        flexDirection: 'row',
        gap: 8,
        paddingLeft: 12
    },
    profilePictureContainer: {
        height: 50,
        width: 40,
        justifyContent: 'center',
        // alignItems: 'center',
    },
    profilePicture: {
        height: 40,
        width: 40,
        backgroundColor: theme.colors.orange,
        borderRadius: 9999,
    },
    postContainer: {
        flex: 1,
        paddingLeft: 12,
    },
    userDetailsContainer: {
        height: 50,
        justifyContent: 'center',
    },
    bottomContainer: {
        paddingLeft: 12,
        flexDirection: 'row',
        height: 50,
    },
    likeContainer: {
        height: 50,
        width: 180,
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        flexDirection: 'row',
    },
    likeIcon: {
        height: 20,
        width: 50,
        backgroundColor: theme.colors.text,
        borderRadius: 9999,
    },
    commentIcon: {
        height: 20,
        width: 50,
        backgroundColor: theme.colors.text,
        borderRadius: 9999,
    },
    shareIcon: {
        height: 20,
        width: 50,
        backgroundColor: theme.colors.text,
        borderRadius: 9999,
    }
}));
