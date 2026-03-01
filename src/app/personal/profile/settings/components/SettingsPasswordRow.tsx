import { ThemedText } from '@/components/ui/common/ThemedText';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { Pressable, View } from 'react-native';
import styles from '../settings.styles';

type SettingsPasswordRowProps = {
  onPress: (event: any) => void | Promise<void>;
  onPressIn: () => void;
};

export default function SettingsPasswordRow({
  onPress,
  onPressIn,
}: SettingsPasswordRowProps) {
  return (
    <View style={styles.section}>
      <View style={styles.itemTitleContainer}>
        <ThemedText style={styles.itemTitle}>Password :</ThemedText>
      </View>
      <View style={styles.itemContainer}>
        <ThemedText style={styles.item}>******</ThemedText>
      </View>
      <Pressable
        onPress={(event) => { void onPress(event); }}
        onPressIn={onPressIn}
        style={({ pressed }) => [
          { opacity: pressed ? 0.1 : 1 },
          styles.changeContainer,
        ]}
      >
        <MaterialCommunityIcon size={25} name={'edit'} />
        {/* <ThemedText type='small' style={styles.changeText} color='red' >Change</ThemedText> */}
      </Pressable>
    </View>
  );
}
