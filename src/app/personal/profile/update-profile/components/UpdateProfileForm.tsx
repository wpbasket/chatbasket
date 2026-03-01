import { Dropdown } from '@/components/ui/common/DropDown';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { Pressable, TextInput } from 'react-native';
import styles from '../update-profile.styles';

type UpdateProfileFormProps = {
  nameValue: string;
  bioValue: string;
  profileVisibleToValue?: 'public' | 'private' | 'personal' | null;
  showNameError: boolean;
  showBioError: boolean;
  showProfileVisibleToError: boolean;
  onChangeName: (text: string) => void;
  onChangeBio: (text: string) => void;
  onSelectProfileVisibleTo: (value: 'public' | 'private' | 'personal') => void;
  onSubmit: () => void;
  onPressInSubmit: () => void;
};

export default function UpdateProfileForm({
  nameValue,
  bioValue,
  profileVisibleToValue,
  showNameError,
  showBioError,
  showProfileVisibleToError,
  onChangeName,
  onChangeBio,
  onSelectProfileVisibleTo,
  onSubmit,
  onPressInSubmit,
}: UpdateProfileFormProps) {
  return (
    <>
      <TextInput
        placeholder="Name"
        inputMode='text'
        maxLength={40}
        value={nameValue}
        onChangeText={onChangeName}
        textContentType='name'
        placeholderTextColor="gray"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, showNameError && styles.inputError]}
      />

      <TextInput
        placeholder="Bio"
        inputMode='text'
        value={bioValue}
        onChangeText={onChangeBio}
        placeholderTextColor="gray"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={150}
        multiline={true}
        style={[styles.bio, showBioError && styles.inputError]}
      />

      <ThemedView style={[styles.profileVisibleToContainer]} >
        <Dropdown
          options={[
            { label: 'Public', value: 'public' },
            { label: 'Private', value: 'private' },
            { label: 'Personal', value: 'personal' },
          ]}
          value={profileVisibleToValue ?? undefined}
          placeholder="Select profile visibility"
          style={styles.dropdownBorder}
          error={showProfileVisibleToError}
          searchable={false}
          onSelect={(value) => onSelectProfileVisibleTo(value as 'public' | 'private' | 'personal')}
        />
      </ThemedView>

      <Pressable
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.submit,
          { opacity: pressed ? 0.1 : 1 }
        ]}
        onPressIn={onPressInSubmit}
      >
        <ThemedText style={styles.submitText} selectable={false}>Save</ThemedText>
      </Pressable>
    </>
  );
}
