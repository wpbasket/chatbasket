# ChatbasketDownloads Module (Android Only)

Native Android module for saving files from private app storage to public device storage using MediaStore API.

> **Platform Support:** Android only. iOS and Web throw `UnavailabilityError`.

## ⚠️ Usage Rule

**This module is ONLY used when the user explicitly requests to save a file to the device's public storage (e.g., "Save to Gallery" or "Download").**

- **Public Storage:** Use `ChatbasketDownloads` (User-initiated). Automatically saves to `DCIM` or `Downloads`.
- **Private Storage:** All other automated media downloads (e.g., message history, auto-downloads) must use `expo-file-system` to download inside the app's **private folders** (`Paths.cache` or `Paths.document`).

---

## 🎯 Features

- ✅ **MediaStore API** (Android 10+ Scoped Storage compliant)
- ✅ **Instant saves** (synchronous file copy from private to public storage)
- ✅ **Message ID tracking** (for device migration)
- ✅ **Auto-organization** (subdirectories by MIME type)
- ✅ **Save events** (instant completion notification)
- ✅ **File management** (info, delete, existence check)
- ✅ **Storage validation** (checks available space before saving)
- ✅ **Error categorization** (IOException, SecurityException, generic errors)
- ✅ **No permissions needed** (Android 10+ Scoped Storage)
- ✅ **Content URIs** (proper Android file access)

---

## 🔒 Permissions

### Storage Permissions
- **Android 10+ (API 29):** **No storage permissions needed** (uses MediaStore with Scoped Storage).
- **Android 9 and below:** App may need `WRITE_EXTERNAL_STORAGE` (handled by Android, not this module).
- **Public Directories:** Automatically saves to `DCIM` or `Downloads`.

All files organized under `Chatbasket/` with automatic subdirectories based on MIME type:

| File Type | Directory | Subdirectory | Example |
|-----------|-----------|--------------|---------|
| Images | DCIM | `images` | `/DCIM/Chatbasket/images/photo.jpg` |
| Videos | DCIM | `videos` | `/DCIM/Chatbasket/videos/clip.mp4` |
| Audio | Download | `audio` | `/Download/Chatbasket/audio/song.mp3` |
| PDFs | Download | `documents` | `/Download/Chatbasket/documents/file.pdf` |
| Documents | Download | `documents` | `/Download/Chatbasket/documents/report.docx` |
| Other | Download | `files` | `/Download/Chatbasket/files/data.bin` |

**Rule:** DCIM for images/videos only, Download for everything else.

---

## 📝 API Reference

### `save()`
Save a file from private app storage to public device storage.

```typescript
const result = await ChatbasketDownloads.save(
  localUri: string,      // "file:///data/user/0/com.app/cache/photo.jpg" (private folder)
  fileName: string,      // "photo.jpg"
  messageId: string      // "msg_123" (for migration tracking)
);

// Returns:
{
  success: true,
  messageId: "msg_123",
  fileName: "photo.jpg",
  folderName: "DCIM/Chatbasket/images",
  mimeType: "image/jpeg",
  directory: "DCIM",
  localUri: "content://media/external/images/media/1234",  // Content URI
  fileSize: 2048000,
  savedPath: "DCIM/Chatbasket/images/photo.jpg"
}
```

**Errors:** 
- `ERR_FILE_NOT_FOUND` - Source file doesn't exist
- `ERR_INSUFFICIENT_STORAGE` - Not enough device storage
- `ERR_IO_FAILURE` - File I/O error (corrupt, locked)
- `ERR_PERMISSION_DENIED` - Permission denied (Android 9 and below)
- `ERR_SAVE_FAILED` - Generic save failure

---

### `checkFileExists()`
Verify file still exists at path.

```typescript
const info = await ChatbasketDownloads.checkFileExists(filePath);

// Returns:
{
  exists: true,
  size: 2048000,
  path: "file:///storage/..."
}
```

---

### `getFileInfo()`
Get file metadata from MediaStore (Android only).

```typescript
const info = await ChatbasketDownloads.getFileInfo(contentUri);

// Returns:
{
  exists: true,
  fileName: "photo.jpg",
  size: 2048000,
  mimeType: "image/jpeg",
  dateAdded: 1673545600  // Unix timestamp
}
```

**Note:** Requires a `content://` URI (returned from `save()`).

---

### `deleteFile()`
Delete saved file from MediaStore.

```typescript
const deleted = await ChatbasketDownloads.deleteFile(contentUri);
// Returns: boolean
```

**Note:** Requires a `content://` URI (returned from `save()`).

---

### `addListener()` (Event-Based)
Listen for save completion automatically.

```typescript
const subscription = ChatbasketDownloads.addListener(
  'onSaveComplete',
  (event) => {
    console.log(`Save ${event.messageId} ${event.status}`);
    
    if (event.status === 'completed') {
      displayMedia(event.localUri);
    } else if (event.status === 'failed') {
      showError(event.error);
    }
  }
);

// Cleanup
subscription.remove();

// Event structure:
{
  messageId: string,
  fileName: string,
  status: 'completed' | 'failed',
  localUri?: string,     // Content URI if successful
  error?: string         // Error message if failed
}
```

**Benefits:**
- Instant notification (no polling)
- Includes error details
- Automatic cleanup

---

## 🔄 Complete Workflow with expo-file-system

### Two-Step Process

This module works in conjunction with `expo-file-system` (v17+) to implement a user-controlled save workflow:

1. **Step 1: Download to Private Storage** (Automatic, using `expo-file-system`)
2. **Step 2: Save to Public Storage** (User-initiated, using `ChatbasketDownloads`)

### Why Two Steps?

- **Privacy:** Downloaded media stays private until user explicitly saves it
- **Storage Control:** User decides what to keep in public gallery
- **Scoped Storage Compliance:** Follows Android best practices
- **No Permissions Needed:** Works without storage permissions on Android 10+

### Installation

```bash
npx expo install expo-file-system
```

### Complete Implementation Example

```typescript
import { Paths, File } from 'expo-file-system';
import ChatbasketDownloads from '@/modules/chatbasket-downloads';
import { useState, useEffect } from 'react';
import { Alert, Platform } from 'react-native';

function ChatMessage() {
  const [activeDownload, setActiveDownload] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Listen for save completion events
  useEffect(() => {
    const subscription = ChatbasketDownloads.addListener(
      'onSaveComplete',
      (event) => {
        if (event.status === 'completed') {
          Alert.alert('✅ Saved!', `${event.fileName} saved to gallery`);
          setIsSaving(false);
          setActiveDownload(null);
        } else {
          Alert.alert('❌ Save Failed', event.error || 'Unknown error');
          setIsSaving(false);
          setActiveDownload(null);
        }
      }
    );

    return () => subscription.remove();
  }, []);

  const handleSaveMedia = async (mediaUrl: string, messageId: string) => {
    try {
      if (Platform.OS !== 'android') {
        Alert.alert('Not Supported', 'This feature is Android-only');
        return;
      }

      // Step 1: Download to private storage (expo-file-system v17+)
      setActiveDownload(messageId);
      
      const fileName = `image_${Date.now()}.jpg`;
      const destinationFile = new File(Paths.document, fileName);

      console.log('Downloading to private folder:', destinationFile.uri);

      // Download file to private storage
      const downloadedFile = await File.downloadFileAsync(
        mediaUrl,
        destinationFile
      );

      console.log('Downloaded:', downloadedFile.uri);
      setActiveDownload(null);

      // Verify download succeeded
      if (!downloadedFile.exists) {
        throw new Error('File not found after download');
      }

      // Step 2: Ask user if they want to save to gallery
      Alert.alert(
        '📥 Downloaded',
        `File: ${fileName}\nSize: ${(downloadedFile.size / 1024).toFixed(2)} KB\n\nSave to Gallery?`,
        [
          { 
            text: 'Cancel', 
            style: 'cancel',
            onPress: () => {
              // Optionally delete private file
              // downloadedFile.delete();
            }
          },
          {
            text: 'Save to Gallery',
            onPress: async () => {
              setIsSaving(true);

              try {
                // Save from private to public storage
                const result = await ChatbasketDownloads.save(
                  downloadedFile.uri,  // Private file URI
                  fileName,
                  messageId
                );

                console.log('Save result:', result);
                // Event listener will handle UI updates

                // Optionally clean up private file after successful save
                // await downloadedFile.delete();

              } catch (err: any) {
                console.error('Save error:', err);
                setIsSaving(false);
                Alert.alert('Save Error', err.message || 'Failed to save file');
              }
            },
          },
        ]
      );

    } catch (err: any) {
      console.error('Download error:', err);
      setActiveDownload(null);
      Alert.alert('Download Error', err.message || 'Failed to download file');
    }
  };

  return (
    <Button
      title={activeDownload ? 'Downloading...' : isSaving ? 'Saving...' : 'Save Image'}
      onPress={() => handleSaveMedia('https://example.com/image.jpg', 'msg_123')}
      disabled={activeDownload !== null || isSaving}
    />
  );
}
```

### expo-file-system v17+ API Quick Reference

```typescript
import { Paths, File } from 'expo-file-system';

// Private storage paths
Paths.cache      // Temporary storage (can be cleared by system)
Paths.document   // Persistent private storage (recommended)

// Download to private storage
const file = new File(Paths.document, 'filename.jpg');
const downloadedFile = await File.downloadFileAsync(url, file);

// Check file properties
console.log(downloadedFile.exists);  // boolean
console.log(downloadedFile.size);    // number (bytes)
console.log(downloadedFile.uri);     // string (file:// path)

// Delete private file (optional cleanup)
await downloadedFile.delete();
```

### Best Practices

1. **Always download to `Paths.document` first** (not directly to public storage)
2. **Check `downloadedFile.exists` before saving** to ensure download succeeded
3. **Use event listeners** for save completion instead of promises
4. **Clean up private files** after successful save to free storage (optional)
5. **Show user confirmation** before saving to public storage
6. **Handle errors gracefully** with user-friendly messages

### State Management Tips

```typescript
// Track which file is being processed
const [activeDownload, setActiveDownload] = useState<string | null>(null);
const [isSaving, setIsSaving] = useState(false);

// Disable buttons while operations are in progress
disabled={activeDownload !== null || isSaving}

// Reset states in error handlers and completion events
```

---

## 🏗️ Architecture

### Migration Support
Files linked to message IDs for device migration:

```
1. Download to private folder → expo-file-system (Paths.cache or Paths.document)
2. User taps "Save" → save() copies file to public storage
3. Store in SQLite: message_id → content_uri
4. Primary device change → Query all saved files
5. Check files: getFileInfo(contentUri)
6. Transfer available files via FileSystem + WebSocket
7. New device saves received files
```

### Device SQLite Schema
```sql
CREATE TABLE message_media (
  message_id TEXT PRIMARY KEY,
  content_uri TEXT NOT NULL,       -- content:// URI from MediaStore
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  folder_name TEXT NOT NULL,       -- e.g., "DCIM/Chatbasket/images"
  file_size INTEGER NOT NULL,
  is_available BOOLEAN DEFAULT 1,
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔍 Edge Cases

### Filename Handling
- No extension → Uses MIME detection, saves to `files`
- Multiple dots → Uses last extension (`my.photo.jpg` → `.jpg`)
- Uppercase → Converts to lowercase (`PHOTO.JPG` → `image/jpeg`)
- Special chars → Android sanitizes automatically
- **Duplicates** → MediaStore appends (1), (2), etc. **automatically**

### Storage Scenarios
- **Storage full** → Throws `ERR_INSUFFICIENT_STORAGE` with space details
- **File corrupt** → Throws `ERR_IO_FAILURE`
- **Permission denied** → Throws `ERR_PERMISSION_DENIED` (Android 9 and below)
- **Source missing** → Throws `ERR_FILE_NOT_FOUND`

### Content URI Behavior
- Content URIs (`content://`) are persistent across app restarts
- Can be used with Android sharing APIs
- Preferred over file paths for Android 10+

---

## 📱 Platform Support

| Platform | Status |
|----------|--------|
| Android | ✅ Full support (API 29+, Scoped Storage) |
| iOS | ❌ `UnavailabilityError` |
| Web | ❌ `UnavailabilityError` |

> **Note:** On Web and iOS, the module methods exist but will throw `UnavailabilityError` when called. This ensures TypeScript safety in shared codebases.

---

## 💡 Usage Example

```typescript
import ChatbasketDownloads from 'chatbasket-downloads';
import * as FileSystem from 'expo-file-system';

// WORKFLOW: Download to private folder first, then save to public storage on user request

// Set up global completion listener
useEffect(() => {
  const subscription = ChatbasketDownloads.addListener(
    'onSaveComplete',
    (event) => {
      // Update SQLite
      db.execute(`
        UPDATE message_media 
        SET is_available = ?, content_uri = ?
        WHERE message_id = ?
      `, [
        event.status === 'completed' ? 1 : 0, 
        event.localUri, 
        event.messageId
      ]);
      
      // Show notification
      if (event.status === 'completed') {
        showNotification('Saved to gallery');
      } else {
        showError(`Failed: ${event.error}`);
      }
    }
  );
  
  return () => subscription.remove();
}, []);

// Step 1: Download to private storage (automatic, no user interaction)
const privateUri = `${FileSystem.cacheDirectory}${fileName}`;
await FileSystem.downloadAsync(url, privateUri);

// Step 2: User explicitly taps "Save to Gallery" button
const handleSaveToGallery = async () => {
  try {
    const result = await ChatbasketDownloads.save(
      privateUri,      // File from private folder
      fileName,
      messageId
    );
    
    // Store in SQLite for migration
    await db.execute(`
      INSERT INTO message_media (
        message_id, content_uri, mime_type, file_name, 
        folder_name, file_size
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      result.messageId,
      result.localUri,
      result.mimeType,
      result.fileName,
      result.folderName,
      result.fileSize
    ]);
    
    showNotification('Saved to ' + result.folderName);
  } catch (error) {
    if (error.code === 'ERR_INSUFFICIENT_STORAGE') {
      showError('Not enough storage space');
    } else {
      showError('Failed to save file');
    }
  }
};

// Later: Verify file still exists
const contentUri = 'content://media/external/images/media/1234';
const info = await ChatbasketDownloads.getFileInfo(contentUri);
if (info.exists) {
  console.log(`File: ${info.fileName}, Size: ${info.size} bytes`);
}

// Delete saved file if needed
const deleted = await ChatbasketDownloads.deleteFile(contentUri);
```

---

## 🛠️ Implementation Details

### MediaStore API
- Uses `MediaStore.Images`, `MediaStore.Video`, and `MediaStore.Downloads` collections
- Automatically creates subdirectories with `RELATIVE_PATH`
- Returns `content://` URIs for proper Android file access
- No permissions needed for Android 10+ (Scoped Storage)

### MIME Type Detection
Supports 40+ file extensions including:
- **Images:** jpg, png, gif, webp, heic, heif, bmp, svg
- **Videos:** mp4, mov, avi, mkv, webm, 3gp, flv
- **Audio:** mp3, wav, ogg, m4a, flac, aac
- **Documents:** pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv
- **Archives:** zip, rar, 7z, tar, gz
- **Other:** apk, and custom extensions → `application/octet-stream`

### Storage Space Check
- Checks available space before saving using `StatFs`
- Throws `ERR_INSUFFICIENT_STORAGE` with human-readable message
- Compatible with Android versions before API 18

---

## 🔐 Security

- File validation (checks existence before saving)
- Storage space validation
- Proper error categorization (IOException, SecurityException)
- Content URI security (no direct file path exposure)
- Android Scoped Storage compliance

---

## 📊 Comparison with Old Implementation

| Feature | Old (DownloadManager) | New (MediaStore) |
|---------|----------------------|------------------|
| Input | HTTPS URL | Local file URI |
| Operation | Async download | Instant save |
| Progress | Available | Not needed (instant) |
| Permissions | Sometimes needed | Not needed (API 29+) |
| Directory | Manual parameter | Auto-detected |
| URI | `file://` | `content://` |
| Storage check | No | Yes |
| Error details | Generic | Categorized |

---

## 📚 Related Documentation

- [Android MediaStore Official Docs](https://developer.android.com/reference/android/provider/MediaStore)
- [Android Scoped Storage Guide](https://developer.android.com/about/versions/11/privacy/storage)
- [Expo Modules API](https://docs.expo.dev/modules/module-api/)
