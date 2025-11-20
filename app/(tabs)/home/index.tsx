import Postcard from '@/components/publicComponents/post/Postcard';
import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { appMode$, setAppMode } from '@/state/appMode/state.appMode';
import userPostsStore from '@/state/publicState/public.state.userPostsStore';
import { LegendList } from "@legendapp/list";
import { useValue } from '@legendapp/state/react';
import { Platform, Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export default function Home() {
  const posts_for_user = useValue(userPostsStore.posts);
  const currentMode = useValue(appMode$.mode);

  const toggleMode = () => {
    const next = currentMode === 'public' ? 'personal' : 'public';
    setAppMode(next);
  };
  return (
    <>
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <ThemedView style={styles.container} >
          <ThemedView style={styles.titleContainer} >
            <ThemedText type="logo" style={styles.logo} selectable={false}>ChatBasket</ThemedText>
            <Pressable
              onPress={toggleMode}
              style={({ pressed }) => [
                { opacity: pressed ? 0.1 : 1 },
                styles.modeToggle
              ]}
            >
              <ThemedText type="default" style={styles.modeText} selectable={false}>
                {currentMode === 'public' ? 'Public' : 'Personal'}
              </ThemedText>
            </Pressable>
          </ThemedView>
          <LegendList
            data={posts_for_user}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <Postcard post={item} interactive={true} key={item.id} />
            )}
            contentContainerStyle={{ paddingBottom: 150 }}
            showsVerticalScrollIndicator={Platform.OS === 'web' ? false : true}
            scrollEnabled={true}
            recycleItems={true}
            maintainVisibleContentPosition={true}
          />
        </ThemedView>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    paddingTop: {
      xs:rt.insets.top,
      sm:rt.insets.top,
      md:rt.insets.top,
      lg:11
    }
  },
  titleContainer: {
    display:{
      xs:'flex',
      sm:'flex',
      md:'flex',
      lg:'none'
    },
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor:theme.colors.BackgroundSelect,
    paddingLeft: 15,
    paddingBottom: 11,
    paddingTop: 11,
    paddingRight: 15,
    justifyContent: 'space-between',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  logo: {
    fontSize: 25,
    color: theme.colors.primary,
  },
  modeToggle: {
    paddingHorizontal: 10,
    // paddingVertical: 2,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 8,
    backgroundColor: theme.colors.primaryDark,
  },
  modeText: {
    fontSize: 14,
    color: theme.colors.reverseText,
    fontWeight: 'bold',
  },
}));
