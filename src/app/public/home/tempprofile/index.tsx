import ProfileList from '@/components/publicComponents/profile/ProfileList';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import currentUserStore from '@/state/publicState/public.state.activeUser';
import { useValue } from '@legendapp/state/react';
import { useCallback, useState } from 'react';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import NotFoundScreen from '@/app/+not-found';

type TABS = 'Posts' | 'Followers' | 'Following'

export default function Profile() {
    const { rt } = useUnistyles();
    const user = useValue(currentUserStore.user);

    const [activeTab, setActiveTab] = useState<TABS>('Posts');

    const onTabPress = useCallback((tab: TABS) => {
        setActiveTab(tab);
    }, []);

    if (false && !user) {
        return (
            <NotFoundScreen />
        )
    }

    return (
        <>
            {/* Existing temp profile UI kept but hidden temporarily */}
            {false && (
                <ThemedView style={styles.container}>
                    <ProfileList
                        user={user}
                        activeTab={activeTab}
                        onTabPress={onTabPress}
                    />
                </ThemedView>
            )}
            <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ThemedText type='defaultGantari'>Coming Soon</ThemedText>
            </ThemedView>
        </>
    );
}



const styles = StyleSheet.create((theme, rt) => ({
    container: {
        flex: 1,
        paddingTop: rt.insets.top
    },
}));
