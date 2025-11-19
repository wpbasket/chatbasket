import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { Image, Pressable } from 'react-native';
import { styles } from '../update-profile.styles';

type UpdateProfileAvatarSectionProps = {
  avatarUri?: string | null;
  hasAvatar: boolean;
  showAvatarError: boolean;
  onChangeAvatar: (event: any) => void;
  onPressInChangeAvatar: () => void;
};

export function UpdateProfileAvatarSection({
  avatarUri,
  hasAvatar,
  showAvatarError,
  onChangeAvatar,
  onPressInChangeAvatar,
}: UpdateProfileAvatarSectionProps) {
  return (
    <ThemedView style={styles.profilePictureContainer}>
      <Pressable
        style={({ pressed }) => [
          { opacity: pressed ? 0.1 : 1 },
          styles.profilePicture,
          showAvatarError && styles.profileInputError,
        ]}
      >
        {hasAvatar && avatarUri && (
          <Image
            source={{ uri: avatarUri }}
            style={styles.profilePictureImage}
          />
        )}
      </Pressable>
      <ThemedView style={styles.outerEditIcon}>
        <Pressable
          onPress={onChangeAvatar}
          onPressIn={onPressInChangeAvatar}
          style={({ pressed }) => [
            { opacity: pressed ? 0.1 : 1 },
            styles.editIcon,
          ]}
        >
          <MaterialCommunityIcon name='image.edit' size={25} />
          <ThemedText style={[styles.bucketText]} selectable={false}>
            Change avatar
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}
