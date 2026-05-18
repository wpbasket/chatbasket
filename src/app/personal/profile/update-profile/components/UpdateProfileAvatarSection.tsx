import { AppButton } from '@/components/ui/common/AppButton';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { Pressable } from 'react-native';
import { ProfileAvatar } from '@/components/personal/profile/ProfileAvatar';
import styles from '../update-profile.styles';

type UpdateProfileAvatarSectionProps = {
  avatarUri?: string | null;
  hasAvatar: boolean;
  showAvatarError: boolean;
  onChangeAvatar: (event?: any) => void;
  onPressInChangeAvatar: () => void;
};

export default function UpdateProfileAvatarSection({
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
        <ProfileAvatar uri={avatarUri} />
      </Pressable>
      <ThemedView style={styles.outerEditIcon}>
        <AppButton
          label="Change avatar"
          icon={<MaterialCommunityIcon name='image.edit' size={15} />}
          onPress={onChangeAvatar}
          onPressIn={onPressInChangeAvatar}
          pressedOpacity={0.1}
          textType="default"
          labelStyle={styles.bucketText}
          style={styles.editIcon}
        />
      </ThemedView>
    </ThemedView>
  );
}
