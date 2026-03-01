import { Redirect } from 'expo-router';

/**
 * chat/index.tsx — redirects to [chat_id].
 * Conversations are accessed from the home screen chat list.
 */
export default function ChatIndex() {
  return <Redirect href="/personal/chat/[chat_id]" />;
}
