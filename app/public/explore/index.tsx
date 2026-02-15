import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  memo
} from 'react';

import {
  FlatList,
  TextInput,
  Pressable,
  Keyboard
} from 'react-native';

import {
  ThemedText,
  ThemedView,
  Header,
  router,
  Stack
} from '@/components/ui/basic';

import { StyleSheet, useUnistyles } from 'react-native-unistyles';

type Message = {
  id: string;
  text: string;
  type: 'me' | 'other';
};

/* ---------------- Optimized Bubble ---------------- */

const MessageBubble = memo(
  ({ text, type }: { text: string; type: 'me' | 'other' }) => {
    return (
      <ThemedView
        style={[
          styles.bubble,
          type === 'me' && styles.myBubble
        ]}
      >
        <ThemedText>{text}</ThemedText>
      </ThemedView>
    );
  },
  (prev, next) =>
    prev.text === next.text && prev.type === next.type
);

/* ---------------- Chat Screen ---------------- */

export default function ChatScreen() {
  const { rt } = useUnistyles();
  const listRef = useRef<FlatList<Message>>(null);

  /* -------- IME Stabilizer -------- */

  const lastIme = useRef(0);
  const keyboardVisible = useRef(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisible.current = true;
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisible.current = false;
      lastIme.current = 0;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (rt.insets.ime > 0) {
      lastIme.current = rt.insets.ime;
    }
  }, [rt.insets.ime]);

  const stableIme =
    keyboardVisible.current
      ? (rt.insets.ime > 0 ? rt.insets.ime : lastIme.current)
      : 0;

  /* -------- Chat State -------- */

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(48);

  const sendMessage = useCallback(() => {
    if (!text.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      type: 'me',
    };

    setMessages(prev => [newMessage, ...prev]);
    setText('');
  }, [text]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble text={item.text} type={item.type} />
    ),
    []
  );

  const keyExtractor = useCallback(
    (item: Message) => item.id,
    []
  );

  return (
    <>
      <Stack.Screen
        options={{
          header: () => (
            <ThemedView style={styles.container}>
              <Header
                onBackPress={() => router.back()}
                centerSection={
                  <ThemedText type="subtitle">
                    Chat
                  </ThemedText>
                }
                rightSection={<ThemedView style={styles.profilePic} />}
              />
            </ThemedView>
          ),
        }}
      />

      <ThemedView
        style={[
          styles.content,
          { transform: [{ translateY: -stableIme }] }
        ]}
      >
        <FlatList
          ref={listRef}
          inverted
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={15}
          windowSize={7}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 12 }}
          keyboardShouldPersistTaps="handled"
        />

        <ThemedView style={styles.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Type message..."
            style={[
              styles.input,
              { height: Math.min(Math.max(48, inputHeight), 120) }
            ]}
            onContentSizeChange={(e) =>
              setInputHeight(e.nativeEvent.contentSize.height)
            }
          />

          <Pressable onPress={sendMessage} style={styles.sendBtn}>
            <ThemedText>Send</ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>
    </>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    paddingTop: rt.insets.top,
  },
  content: {
    flex: 1,
  },
  bubble: {
    padding: 10,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    maxWidth: '75%',
    alignSelf: 'flex-start',
  },
  myBubble: {
    alignSelf: 'flex-end',
  },
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
  profilePic: {
    width: 45,
    height: 45,
    borderRadius: 9999,
    backgroundColor: theme.colors.yellow,
  },
}));
