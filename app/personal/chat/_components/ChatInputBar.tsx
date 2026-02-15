import React, { useState } from 'react';
import { TextInput, Pressable, NativeSyntheticEvent, TextInputContentSizeChangeEventData } from 'react-native';
import { ThemedText, ThemedView } from '@/components/ui/basic';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
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
    const { theme } = useUnistyles();
    const { handlePressIn } = pressableAnimation();
    const [inputHeight, setInputHeight] = useState(48);

    const text = useValue(() => $chatMessagesState.chats[chatId]?.inputText.get() || '');
    const sending = useValue(() => sendingObs?.get() || false);

    const onChangeText = (val: string) => {
        $chatMessagesState.updateInputText(chatId, val);
    };

    const canSend = text.trim().length > 0 && !sending;

    const handleSend = () => {
        onSend();
        setInputHeight(48);
    };

    return (
        <ThemedView style={styles.inputBar}>
            <TextInput
                value={text}
                onChangeText={onChangeText}
                multiline
                placeholder="Type message..."
                placeholderTextColor={theme.colors.textSecondary}
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
                onPress={handleSend}
                onPressIn={handlePressIn}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={sending ? "Sending message" : "Send message"}
                accessibilityState={{ disabled: !canSend, busy: sending }}
                style={({ pressed }) => [
                    styles.sendBtn,
                    !canSend && styles.sendBtnDisabled,
                    pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }
                ]}
            >
                <IconSymbol
                    name="paperplane.fill"
                    size={20}
                    color={canSend ? theme.colors.reverseText : theme.colors.textSecondary}
                />
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
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: theme.colors.card,
        color: theme.colors.text,
        maxHeight: 120,
        fontSize: 16,
    },
    sendBtn: {
        marginLeft: 12,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendBtnDisabled: {
        backgroundColor: theme.colors.border,
        opacity: 0.6,
    },
}));
