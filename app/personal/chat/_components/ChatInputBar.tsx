import React, { useState } from 'react';
import { TextInput, Pressable, NativeSyntheticEvent, TextInputContentSizeChangeEventData } from 'react-native';
import { ThemedText, ThemedView } from '@/components/ui/basic';
import { StyleSheet } from 'react-native-unistyles';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { $chatMessagesState, useValue } from '@/state/personalState/chat/personal.state.chat';

import type { ObservablePrimitive } from '@legendapp/state';

type ChatInputBarProps = {
    chatId: string;
    onSend: () => void;
    sendingObs?: ObservablePrimitive<boolean>;
};

export default function ChatInputBar({
    chatId,
    onSend,
    sendingObs,
}: ChatInputBarProps) {
    const { handlePressIn } = pressableAnimation();
    const [inputHeight, setInputHeight] = useState(48);

    const text = useValue(() => $chatMessagesState.chats[chatId]?.inputText.get() || '');
    const sending = useValue(() => sendingObs?.get() || false);

    const onChangeText = (val: string) => {
        $chatMessagesState.updateInputText(chatId, val);
    };

    const canSend = text.trim().length > 0 && !sending;

    return (
        <ThemedView style={styles.inputBar}>
            <TextInput
                value={text}
                onChangeText={onChangeText}
                multiline
                placeholder="Type message..."
                placeholderTextColor="#999"
                returnKeyType="send"
                submitBehavior="newline"
                accessibilityLabel="Message input"
                accessibilityHint="Type your message here"
                style={[
                    styles.input,
                    { height: Math.min(Math.max(48, inputHeight), 120) }
                ]}
                onContentSizeChange={(e) =>
                    setInputHeight(e.nativeEvent.contentSize.height)
                }
            />

            <Pressable
                onPress={onSend}
                onPressIn={handlePressIn}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={sending ? "Sending message" : "Send message"}
                accessibilityState={{ disabled: !canSend, busy: sending }}
                style={({ pressed }) => [
                    styles.sendBtn,
                    !canSend && styles.sendBtnDisabled,
                    pressed && { opacity: 0.1 }
                ]}
            >
                <ThemedText>Send</ThemedText>
            </Pressable>
        </ThemedView>
    );
}

const styles = StyleSheet.create((theme, rt) => ({
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: rt.insets.bottom + 8,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
    },
    input: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: theme.colors.surface,
        maxHeight: 120,
    },
    sendBtn: {
        marginLeft: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        justifyContent: 'center',
    },
    sendBtnDisabled: {
        opacity: 0.4,
    },
}));
