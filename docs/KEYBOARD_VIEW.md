# 📱 Keyboard Block Movement Architecture (Final Production Version)

A scalable and stable architecture for handling keyboard open/close
using block movement animation in React Native chat screens.

This version includes:

- Stable bottom scroll behavior
- Auto-scroll to latest on first mount
- Smart bottom pinning for new messages
- Keyboard-safe layout
- No scroll jump
- Production-ready structure

---

# 🎯 Goal

- Smooth keyboard transition  
- No layout jump  
- No scroll flicker  
- No forced scroll jumps  
- Predictable bottom behavior  
- Scales to large chat history  

---

# 🧠 Core Principle

Do **NOT** resize layout when keyboard opens.

Instead:

```
Keyboard opens → capture keyboard height
Animate entire content block upward
Keyboard closes → animate back
```

This prevents:

- Layout recalculation
- Scroll offset instability
- Virtualization thrashing
- Padding hacks

---

# 🏗 Structural Layout

## 1️⃣ Fixed Header

- `position: absolute`
- Uses safe area inset
- Never moves

---

## 2️⃣ Content Wrapper

- `marginTop = headerHeight + inset`
- `overflow: hidden`
- Clips animated content

---

## 3️⃣ Single Moving Block (Core System)

Everything inside this container moves together:

- LegendList
- Input box

```tsx
<MotionView
  animate={{ y: -keyboardHeight }}
  transition={{ type: 'timing', duration: 0 }}
>
  {/* List + Input */}
</MotionView>
```

Only ONE animated container.

Never animate list and input separately.

---

# ⌨ Keyboard Control Strategy

Disable Android resize mode:

```tsx
KeyboardController.setInputMode(
  AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING
);
```

Why?

Android auto-resize causes:

- Layout thrashing
- Scroll jump
- Re-measure cycles
- Broken virtualization

Manual control is deterministic.

---

# 🎯 Keyboard Listener Pattern

Single source of truth:

```tsx
const [keyboardHeight, setKeyboardHeight] = useState(0);
```

Attach listeners:

```tsx
useFocusEffect(
  useCallback(() => {
    const showSub = KeyboardEvents.addListener(
      'keyboardDidShow',
      (e) => setKeyboardHeight(e.height)
    );

    const hideSub = KeyboardEvents.addListener(
      'keyboardDidHide',
      () => setKeyboardHeight(0)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
      KeyboardController.setDefaultMode();
    };
  }, [])
);
```

No extra state.
No derived flags.

---

# 📋 LegendList Integration (Final Stable Version)

## 🔥 Bottom Stability Props

```tsx
<LegendList
  ...
  alignItemsAtEnd
  maintainScrollAtEnd
  maintainScrollAtEndThreshold={0.1}
/>
```

### What They Do

- `alignItemsAtEnd`
  - Aligns short content to bottom

- `maintainScrollAtEnd`
  - Keeps scroll pinned when layout changes
  - Does NOT force scroll if user scrolled up

- `maintainScrollAtEndThreshold`
  - Defines how close to bottom counts as “at bottom”

These prevent jump when:

- Keyboard opens
- Keyboard closes
- Content size changes

---

# 🚀 Auto Scroll to Latest (Final Production Pattern)

## ✅ Only Initial Scroll

We scroll to bottom **once**, on first layout:

```tsx
const hasMounted = useRef(false);

const handleContentSizeChange = () => {
  if (!hasMounted.current && data.length > 0) {
    listRef.current?.scrollToEnd({ animated: false });
    hasMounted.current = true;
  }
};
```

That’s it.

---

## ❌ Do NOT Force Scroll on Every New Message

We intentionally **removed** this pattern:

```tsx
useEffect(() => {
  listRef.current?.scrollToEnd({ animated: true });
}, [data.length]);
```

Why?

Because `maintainScrollAtEnd` already:

- Keeps bottom pinned when user is at bottom
- Does NOT interrupt when user scrolls up

Manual forcing becomes intrusive.

---

# 🧩 Engineering Rules

## ✅ Animate One Container Only

Never animate:

- Individual messages
- Input separately
- Dynamic padding repeatedly

---

## ✅ Keep State Minimal

Store only:

```
keyboardHeight
```

Avoid:

- isKeyboardOpen
- multiple derived states
- redundant scroll flags

---
if you want yoy can modufy this with better condtions
 // ✅ Auto-scroll only when new messages added
    useEffect(() => {
      if (hasMounted.current && data.length > 0) {
        listRef.current?.scrollToEnd({ animated: true });
      }
    }, [data.length]);

## ✅ Never Tie Keyboard State to List Data

Keyboard animation must not mutate:

- messages array
- keyExtractor
- renderItem identity

---

## ✅ Hardware Accelerated Movement

`translateY` animation:

- GPU accelerated
- No layout re-measure
- Scales to 1000+ messages

---

# ⚠ Common Mistakes

- Mixing padding and translateY
- Using KeyboardAvoidingView
- Letting Android resize layout
- Animating multiple components
- Recreating message arrays
- Forcing scroll on every update

---

# 🏁 Engineering Philosophy

Move less.  
Render less.  
Compute less.  
Animate one block only.  
Let the list manage bottom intelligently.

This structure remains stable as chat complexity grows.

---

# ✅ Full Working Example (Final Version)

```tsx
// Final Production Version (Initial Scroll + Stable Bottom)

import React, {
  useCallback,
  useMemo,
  useState,
  useRef,
} from 'react';
import { View, Text, TextInput } from 'react-native';
import { LegendList, LegendListRef } from '@legendapp/list';
import {
  KeyboardController,
  AndroidSoftInputModes,
  KeyboardEvents,
} from 'react-native-keyboard-controller';
import { Motion } from '@legendapp/motion';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// ─── Dummy Data ──────────────────────────────────────────────────────────────
const DUMMY_MESSAGES = Array.from({ length: 30 }, (_, i) => ({
  id: `msg-${i}`,
  text: `Explore message #${i + 1}: Testing Legend Motion block move.`,
}));

const MessagesList = React.memo(
  ({ data }: { data: typeof DUMMY_MESSAGES }) => {
    const listRef = useRef<LegendListRef>(null);
    const hasMounted = useRef(false);

    const handleContentSizeChange = () => {
      if (!hasMounted.current && data.length > 0) {
        listRef.current?.scrollToEnd({ animated: false });
        hasMounted.current = true;
      }
    };

    return (
      <LegendList
        ref={listRef}
        data={data}
        renderItem={({ item }) => (
          <View style={{ padding: 15 }}>
            <Text>{item.text}</Text>
          </View>
        )}
        keyExtractor={(item) => item.id}
        estimatedItemSize={60}
        alignItemsAtEnd
        maintainScrollAtEnd
        maintainScrollAtEndThreshold={0.1}
        onContentSizeChange={handleContentSizeChange}
      />
    );
  }
);

type MotionViewProps = Parameters<typeof Motion.View>[0];
const MotionView =
  Motion.View as unknown as React.ComponentType<MotionViewProps>;

export default function ExploreScreen() {
  const { rt } = useUnistyles();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useFocusEffect(
    useCallback(() => {
      KeyboardController.setInputMode(
        AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING
      );

      const showSub = KeyboardEvents.addListener(
        'keyboardDidShow',
        (e) => setKeyboardHeight(e.height)
      );

      const hideSub = KeyboardEvents.addListener(
        'keyboardDidHide',
        () => setKeyboardHeight(0)
      );

      return () => {
        showSub.remove();
        hideSub.remove();
        KeyboardController.setDefaultMode();
      };
    }, [])
  );

  return (
    <View style={{ flex: 1 }}>
      <MotionView
        animate={{ y: -keyboardHeight }}
        transition={{ type: 'timing', duration: 0 }}
        style={{ flex: 1 }}
      >
        <MessagesList data={DUMMY_MESSAGES} />
        <TextInput
          style={{
            height: 45,
            borderTopWidth: 1,
            paddingHorizontal: 15,
          }}
          placeholder="Type..."
        />
      </MotionView>
    </View>
  );
}
```

---

## 📘 Word of the Day

**Robust**  
Hindi meaning: मजबूत  

Example: This scroll architecture is robust for large chat systems.
