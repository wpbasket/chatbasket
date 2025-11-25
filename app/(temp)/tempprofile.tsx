import ProfileList from '@/components/publicComponents/profile/ProfileList';
import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import currentUserStore from '@/state/publicState/public.state.activeUser';
import { useValue } from '@legendapp/state/react';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native-unistyles';
import NotFoundScreen from '../+not-found';

type TABS = 'Posts' | 'Followers' | 'Following'

export default function Profile() {
    const user = useValue(currentUserStore.user);

    const [activeTab, setActiveTab] = useState<TABS>('Posts');

    const onTabPress = useCallback((tab: TABS) => {
        setActiveTab(tab);
    }, []);

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
