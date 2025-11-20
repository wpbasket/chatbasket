Sure! Here is a **detailed**, **well-structured**, **TypeScript-friendly**, **Markdown cheat-sheet** for **Legend-State v3 React + React Native**, focused on real-world use-cases and optimized for **Expo + Unistyles** (so we always keep native components).

---

# #️⃣ Legend-State v3 React Cheat-Sheet

### **Fine-Grained Reactivity + Control-Flow Components + Reactive Components**

*(TypeScript + Markdown Edition)*

---

# ⭐ Overview

Legend-State gives you **fine-grained**, **super-fast** UI updates without re-rendering entire component trees.

It does this by providing:

## **Reactive Component APIs**

* `reactive()`
* `reactiveObserver()`
* `reactiveComponents()`

## **Control-Flow Components**

* `For`
* `Show`
* `Switch`
* `Memo`
* `Computed`

## **Core State APIs**

* `observable()`
* `useObservable()`
* `computed()`

This cheat-sheet explains **when and how to use each**, with **TypeScript examples**, and avoids `$View/$Text` so styling works with **React Native Unistyles**.

---

# ------------------------------------------

# 🍀 1. Reactive Component APIs

# ------------------------------------------

---

# ## 1.1 `reactive()`

### ✔ Best when:

* Your component **does NOT use `.get()` inside**.
* You only pass **reactive props** `$prop={() => ...}`.
* Most common for small UI items dependent on parent state.

### ✔ Definition (TS)

```ts
const MyComp = reactive<{ $title: string }>(function MyComp({ title }) {
  return <Text>{title}</Text>;
});
```

### ✔ Usage

```tsx
<MyComp $title={() => user$.name.get()} />
```

---

# ## 1.2 `reactiveObserver()`

### ✔ Best when:

* Your component **reads observables internally** using `.get()`.
* You don’t want parent re-renders.
* Perfect for **Feed items, Chat rows, Badges, Counters, Timestamps**.

### ✔ Definition (TS)

```ts
const MessageRow = reactiveObserver<{ msg$: Observable<Message> }>(
  function MessageRow({ msg$ }) {
    return <Text>{msg$.text.get()}</Text>;
  }
);
```

### ✔ Why

Every `.get()` inside this component automatically tracks changes.

---

# ## 1.3 `reactiveComponents()`

### ✔ Best when:

* You want to make an entire **UI library reactive at once**.
* Mostly useful on **Web** (Framer Motion).

### ✔ Example (Web Only)

```ts
const $Motion = reactiveComponents(motion);

<$Motion.div $animate={() => ({ x: pos$.get() })} />
```

> ⚠️ **Not recommended for React Native** when using Unistyles — it requires actual native `View`/`Text`.

---

# ------------------------------------------

# 🍀 2. Control-Flow Components

# ------------------------------------------

---

# ## 2.1 `<For>` — Reactive Lists

### ✔ Use when:

* Rendering arrays (messages, feed posts, notifications).
* Updating one item shouldn’t re-render the whole list.

### ✔ TS Example (React Native)

```tsx
<For each={messages$.get()}>
  {(msg$) => <MessageRow key={msg$.id.get()} msg$={msg$} />}
</For>
```

---

# ## 2.2 `<Show>` — Conditional UI

### ✔ Use when:

* You want to show/hide UI based on observable.
* Parent component must remain static.

### ✔ Example

```tsx
<Show if={() => user$.online.get()}>
  {() => <Text>Online</Text>}
</Show>
```

---

# ## 2.3 `<Switch>` — Multi-case conditional

### ✔ Use when:

* Screen modes → “profile”, “edit”, “settings”
* Only one block visible at a time.

```tsx
<Switch value={() => mode$.get()}>
  {() => ({
    profile: () => <ProfileScreen />,
    settings: () => <SettingsScreen />,
    edit:     () => <EditScreen />,
  })}
</Switch>
```

---

# ## 2.4 `<Memo>` — Isolated updates

### ✔ Use when:

* Tiny UI part needs frequent updates.
* Parent re-render should NOT affect this block.

### ✔ Example:

```tsx
<Memo>
  {() => <Text>Count: {counter$.value.get()}</Text>}
</Memo>
```

---

# ## 2.5 `<Computed>` — Derived values inside JSX

### ✔ Use when:

* You need to compute styles or values from observables.

### ✔ Example:

```tsx
const color$ = computed(() =>
  isOnline$.get() ? "green" : "gray"
);

<Text style={{ color: color$.get() }} />
```

---

# ------------------------------------------

# 🍀 3. Core State APIs

# ------------------------------------------

---

# ## 3.1 `observable()` (global state)

```ts
const user$ = observable({
  name: "Nitish",
  online: false,
});
```

---

# ## 3.2 `useObservable()` (inside component)

```tsx
const form$ = useObservable({
  email: "",
  age: 21,
});
```

---

# ## 3.3 `computed()`

```ts
const fullName$ = computed(() => `${user$.first.get()} ${user$.last.get()}`);
```

---

# ------------------------------------------

# 🍀 4. Combined REAL USE CASES

# ------------------------------------------

---

# ## 4.1 Chat Message List (Best Pattern)

### React Native + Unistyles compatible

### 🔹 Tools used:

* `For`
* `reactiveObserver`
* `Memo`

### ✔ TypeScript Example

```tsx
const MessageRow = reactiveObserver<{ msg$: Observable<Message> }>(
  ({ msg$ }) => (
    <View style={{ padding: 10 }}>
      {/* Main text */}
      <Memo>{() => <Text>{msg$.text.get()}</Text>}</Memo>

      {/* Unread badge */}
      <Memo>
        {() =>
          msg$.unread.get() ? (
            <View style={{ backgroundColor: "red", borderRadius: 10 }}>
              <Text>•</Text>
            </View>
          ) : null
        }
      </Memo>
    </View>
  )
);

export function ChatList() {
  return (
    <For each={messages$.get()}>
      {(msg$) => <MessageRow key={msg$.id.get()} msg$={msg$} />}
    </For>
  );
}
```

---

# ## 4.2 Feed Item: Likes, Comments, Saves

### 🔹 Tools used:

* `reactiveObserver`
* `Memo`
* `computed`

### ✔ TypeScript Example

```tsx
const FeedItem = reactiveObserver<{ item$: Observable<Post> }>(
  ({ item$ }) => {
    const likeColor$ = computed(() =>
      item$.liked.get() ? "#ef4444" : "#9ca3af"
    );

    return (
      <View>
        <Text>{item$.title.get()}</Text>

        <Memo>{() => <Text>{item$.body.get()}</Text>}</Memo>

        <TouchableOpacity
          onPress={() => item$.liked.set(!item$.liked.get())}>
          <Text style={{ color: likeColor$.get() }}>Like</Text>
        </TouchableOpacity>
      </View>
    );
  }
);
```

---

# ## 4.3 Modal With Modes

### 🔹 Tools:

* `reactiveObserver`
* `Show`
* `Switch`

```tsx
const ModeModal = reactiveObserver(() => (
  <Show if={() => modalMode$.get() !== "none"}>
    <Switch value={() => modalMode$.get()}>
      {() => ({
        profile: () => <Profile />,
        settings: () => <Settings />,
        edit: () => <Edit />,
      })}
    </Switch>
  </Show>
));
```

---

# ## 4.4 Composer + Typing Indicator

### 🔹 Tools:

* `reactive()` for banner
* `reactiveObserver()` for composer
* native TextInput with `.get()` and `.set()`

```tsx
const TypingBanner = reactive<{ $typing: any }>(({ typing }) =>
  typing?.userId ? <Text>{typing.userId} typing...</Text> : null
);

const Composer = reactiveObserver(() => (
  <View>
    <TextInput
      value={text$.get()}
      onChangeText={(v) => text$.set(v)}
    />
  </View>
));
```

---

# ------------------------------------------

# 🍀 5. Quick Decision Table

# ------------------------------------------

| Need                                | Best API             |
| ----------------------------------- | -------------------- |
| Component reads `.get()` internally | `reactiveObserver()` |
| Component uses `$props`             | `reactive()`         |
| Tiny part updates                   | `Memo`               |
| Derived styles/values               | `Computed`           |
| Conditional                         | `Show` / `Switch`    |
| List of items                       | `For`                |
| Make whole library reactive         | `reactiveComponents` |

---

# ------------------------------------------

# 🧠 Final Notes for React Native Unistyles

> You **must keep real native components** (`View`, `Text`, `TextInput`).

Use:

* `reactiveObserver` (wrap your component)
* `Memo`
* `Computed`
* `For`
* `Show`
* `Switch`

Avoid:

* `$View`
* `$Text`
* `$TextInput`

---

If you want, I can generate this cheat-sheet as a **PDF**, **README.md**, **Notion-ready version**, or **TS file with reusable utilities**.

---

**Word of the day:** **“Coherent”** — हिन्दी: **“सुसंगत / स्पष्ट रूप से जुड़े हुए”** (means logically connected and easy to follow).
