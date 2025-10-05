import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { use$ } from '@legendapp/state/react';
import { router } from 'expo-router';
import { useState, useCallback } from 'react';
import { StyleSheet } from 'react-native-unistyles';
import currentUserStore from '@/state/publicState/activeUser.state';
import ProfileList from '@/components/publicComponents/profile/ProfileList';
import NotFoundScreen from '../+not-found';
import { Platform } from 'react-native';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import Sidebar from '@/components/sidebar/Sidebar';

type TABS = 'Posts' | 'Followers' | 'Following'
export default function Profile() {
    const user = use$(currentUserStore.user);

    const [activeTab, setActiveTab] = useState<TABS>('Posts');

    const onTabPress = useCallback((tab: TABS) => {
        setActiveTab(tab);
    }, []);

    if (!user) {
        return (
            <NotFoundScreen />
        )
    }

    const goBack = () => {
        router.back();
    };

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
        paddingTop:rt.insets.top
        
    },
}));
