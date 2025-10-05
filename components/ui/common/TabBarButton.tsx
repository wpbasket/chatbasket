import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ThemedView } from './ThemedView';


export function TabBarButton(props: BottomTabBarButtonProps) {
  
  const { children, onPress, accessibilityState } = props;
  const icon = React.Children.toArray(children)[0];
  const label = React.Children.toArray(children)[1];
  const isWeb = Platform.OS === 'web';
  return (
    <ThemedView
      style={styles.container}
    >
      <Pressable
        onPress={onPress}
        accessibilityState={accessibilityState}
        hitSlop={8}
        style={({ pressed }) => [
          { opacity: pressed ? 0.1 : 1 },
          styles.pressable,
        ]}
      >
        {isWeb ? (
          <>
            {icon}
            {label && <View style={styles.label}>{label}</View>}
          </>
        ) : (
          icon
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles= StyleSheet.create((theme)=>({
   container:{
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
   },
   pressable:{
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    // Prevent selecting any text inside the tab button on web
    userSelect: 'none',
   },
   label:{
    marginLeft: 6,
    // Extra guard to prevent selection of label text on web
    userSelect: 'none',
   }


}))
