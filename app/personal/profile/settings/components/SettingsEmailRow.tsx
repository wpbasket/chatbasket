import { ThemedText } from '@/components/ui/common/ThemedText';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { Pressable, View } from 'react-native';
import styles from '../settings.styles';

type SettingsEmailRowProps = {
  email: string | null | undefined;
  onPress: (event: any) => void | Promise<void>;
  onPressIn: () => void;
};

export default function SettingsEmailRow({
  email,
  onPress,
  onPressIn,
}: SettingsEmailRowProps) {
  return (
    <View style={styles.section}>
      <View style={styles.itemTitleContainer}>
        <ThemedText style={styles.itemTitle}>Email :</ThemedText>
      </View>
      <View style={styles.itemContainer}>
        <ThemedText style={styles.item}>{email}</ThemedText>
      </View>
      <Pressable
        onPress={(event) => { void onPress(event); }}
        onPressIn={onPressIn}
        style={({ pressed }) => [
          { opacity: pressed ? 0.1 : 1 },
          styles.changeContainer,
        ]}
      >
        <MaterialCommunityIcon size={25} name={'account.emailEdit'} />
        {/* <ThemedText type='small' style={styles.changeText} color='red' >Change</ThemedText> */}
      </Pressable>
    </View>
  );
}
