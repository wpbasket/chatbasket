import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { pressableAnimation } from '@/hooks/pressableAnimation';

type TABS = 'Posts' | 'Followers' | 'Following';

type TabsSectionProps = {
  activeTab: TABS;
  onTabPress: (tab: TABS) => void;
};

const TabsSection = React.memo(({ activeTab, onTabPress }: TabsSectionProps) => {
  const { handlePressIn } = pressableAnimation();

  // Memoized tab press handlers to prevent unnecessary re-renders
  const onPostsPress = useCallback(() => {
    onTabPress('Posts');
  }, [onTabPress]);

  const onFollowersPress = useCallback(() => {
    onTabPress('Followers');
  }, [onTabPress]);

  const onFollowingPress = useCallback(() => {
    onTabPress('Following');
  }, [onTabPress]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPostsPress}
        style={({ pressed }) => [
          styles.tab,
          activeTab === 'Posts' && styles.tabActive,
          { opacity: pressed ? 0.1 : 1 },
        ]}
        onPressIn={handlePressIn}
      >
        <ThemedText
          type="defaultSemiBold"
          lightColor={activeTab === 'Posts' ? '#00bb77' : '#737373'}
          darkColor={activeTab === 'Posts' ? '#00bb77' : 'rgb(163, 163, 163)'}
        >
          Posts
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={onFollowersPress}
        style={({ pressed }) => [
          styles.tab,
          { opacity: pressed ? 0.1 : 1 },
          activeTab === 'Followers' && styles.tabActive,
        ]}
        onPressIn={handlePressIn}
      >
        <ThemedText
          type="defaultSemiBold"
          lightColor={activeTab === 'Followers' ? '#00bb77' : '#737373'}
          darkColor={activeTab === 'Followers' ? '#00bb77' : 'rgb(163, 163, 163)'}
        >
          Followers
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={onFollowingPress}
        style={({ pressed }) => [
          styles.tab,
          { opacity: pressed ? 0.1 : 1 },
          activeTab === 'Following' && styles.tabActive,
        ]}
        onPressIn={handlePressIn}
      >
        <ThemedText
          type="defaultSemiBold"
          lightColor={activeTab === 'Following' ? '#00bb77' : '#737373'}
          darkColor={activeTab === 'Following' ? '#00bb77' : 'rgb(163, 163, 163)'}
        >
          Following
        </ThemedText>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: 'row',
    height: 40,
    // borderBottomWidth: 1,
    // borderBottomColor: theme.colors.neutral,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabSelectedTextColor:{
    color:theme.colors.primary
  }
}));

export default TabsSection;
