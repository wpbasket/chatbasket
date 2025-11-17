import ProfileList from '@/components/publicComponents/profile/ProfileList';
import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import currentUserStore from '@/state/publicState/public.state.activeUser';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native-unistyles';
import NotFoundScreen from '../+not-found';

type TABS = 'Posts' | 'Followers' | 'Following'

export default function Profile() {
    const user = useLegend$(currentUserStore.user);

    const [activeTab, setActiveTab] = useState<TABS>('Posts');

    const onTabPress = useCallback((tab: TABS) => {
        setActiveTab(tab);
    }, []);

    const goBack = () => {
        router.back();
    };

    if (!user) {
        return (
            <NotFoundScreen />
        )
    }

    return (
        <ThemedViewWithSidebar>
            <ThemedViewWithSidebar.Sidebar>
                <Sidebar />
            </ThemedViewWithSidebar.Sidebar>
            <ThemedViewWithSidebar.Main>
                <ThemedView style={styles.container}>

                    <ProfileList
                        user={user}
                        activeTab={activeTab}
                        onTabPress={onTabPress}
                    />
                </ThemedView>
            </ThemedViewWithSidebar.Main>
        </ThemedViewWithSidebar>
    );
}



const styles = StyleSheet.create((theme, rt) => ({
    container: {
        flex: 1,
        paddingTop: rt.insets.top

    },
}));
