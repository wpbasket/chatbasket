import { Dropdown } from "@/components/ui/common/DropDown";
import { ThemedText } from "@/components/ui/common/ThemedText";
import { ThemedView } from "@/components/ui/common/ThemedView";
import { Pressable, TextInput } from "react-native";
import styles from "../create-profile.styles";

type CreateProfileFormProps = {
  nameValue: string;
  profileTypeValue?: "public" | "private" | "personal" | null;
  showNameError: boolean;
  showProfileTypeError: boolean;
  onChangeName: (text: string) => void;
  onSelectProfileType: (value: "public" | "private" | "personal") => void;
  onSubmit: () => void;
  onPressInSubmit: () => void;
};

export default function CreateProfileForm({
  nameValue,
  profileTypeValue,
  showNameError,
  showProfileTypeError,
  onChangeName,
  onSelectProfileType,
  onSubmit,
  onPressInSubmit,
}: CreateProfileFormProps) {
  return (
    <>
      <TextInput
        placeholder="Name"
        inputMode="text"
        maxLength={40}
        value={nameValue}
        onChangeText={onChangeName}
        textContentType="name"
        placeholderTextColor="gray"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, showNameError && styles.inputError]}
      />

      <Dropdown
        options={[
          { label: "Public", value: "public" },
          { label: "Private", value: "private" },
          { label: "Personal", value: "personal" },
        ]}
        value={profileTypeValue ?? undefined}
        placeholder="Select profile visibility"
        containerStyle={styles.profileVisibleToContainer}
        error={showProfileTypeError}
        searchable={false}
        onSelect={(value) => onSelectProfileType(value as "public" | "private" | "personal")}
      />

      <Pressable
        style={({ pressed }) => [
          styles.submit,
          { opacity: pressed ? 0.1 : 1 },
        ]}
        onPress={onSubmit}
        onPressIn={onPressInSubmit}
      >
        <ThemedText style={styles.submitText} selectable={false}>
          Create
        </ThemedText>
      </Pressable>
    </>
  );
}
