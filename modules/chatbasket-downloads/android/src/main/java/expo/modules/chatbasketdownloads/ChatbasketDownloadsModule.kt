package expo.modules.chatbasketdownloads

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.content.ContentValues
import android.provider.MediaStore
import android.os.Build
import android.os.Environment
import android.os.StatFs
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import expo.modules.kotlin.exception.CodedException

class ChatbasketDownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChatbasketDownloads")
    
    // ✅ Event for save completion (like old module's onDownloadComplete)
    Events("onSaveComplete")

    // ✅ Main save function with messageId tracking (like old module)
    AsyncFunction("save") { localUri: String, fileName: String, messageId: String ->
      val filePath = localUri.replace("file://", "")
      val file = File(filePath)
      
      // ✅ Validate file exists before saving
      if (!file.exists()) {
        throw CodedException("ERR_FILE_NOT_FOUND", "File not found: $filePath", null)
      }

      // ✅ Get file size (useful for progress tracking)
      val fileSize = file.length()

      // ✅ Priority 2: Check available storage space before attempting to save
      val availableSpace = getAvailableStorageSpace()
      if (fileSize > availableSpace) {
        throw CodedException(
          "ERR_INSUFFICIENT_STORAGE", 
          "Not enough storage space: need ${fileSize / 1024 / 1024}MB, have ${availableSpace / 1024 / 1024}MB available", 
          null
        )
      }

      val mimeType = getMimeType(fileName)
      val resolver = appContext.reactContext?.contentResolver
        ?: throw CodedException("ERR_NO_CONTEXT", "React context not available", null)

      try {
        val result = when {
          // Images -> DCIM/Chatbasket/images/
          mimeType.startsWith("image/") -> {
            val values = ContentValues().apply {
              put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
              put(MediaStore.Images.Media.MIME_TYPE, mimeType)
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, 
                    "${Environment.DIRECTORY_DCIM}/Chatbasket/images")
              }
            }

            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
              MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
              MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }

            val savedUri = saveFile(resolver, collection, values, file)
            SaveResult(savedUri, "DCIM/Chatbasket/images", Environment.DIRECTORY_DCIM)
          }

          // Videos -> DCIM/Chatbasket/videos/
          mimeType.startsWith("video/") -> {
            val values = ContentValues().apply {
              put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
              put(MediaStore.Video.Media.MIME_TYPE, mimeType)
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Video.Media.RELATIVE_PATH, 
                    "${Environment.DIRECTORY_DCIM}/Chatbasket/videos")
              }
            }

            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
              MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
              MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            }

            val savedUri = saveFile(resolver, collection, values, file)
            SaveResult(savedUri, "DCIM/Chatbasket/videos", Environment.DIRECTORY_DCIM)
          }

          // Everything else -> Download/Chatbasket/[category]/
          else -> {
            val subDirectory = getDownloadSubfolder(mimeType)
            
            val values = ContentValues().apply {
              put(MediaStore.Downloads.DISPLAY_NAME, fileName)
              put(MediaStore.Downloads.MIME_TYPE, mimeType)
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Downloads.RELATIVE_PATH, 
                    "${Environment.DIRECTORY_DOWNLOADS}/Chatbasket/$subDirectory")
              }
            }

            val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
              MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
              MediaStore.Downloads.EXTERNAL_CONTENT_URI
            }

            val savedUri = saveFile(resolver, collection, values, file)
            SaveResult(savedUri, "Download/Chatbasket/$subDirectory", Environment.DIRECTORY_DOWNLOADS)
          }
        }

        // ✅ Emit event when save completes (like old module)
        sendEvent("onSaveComplete", mapOf(
          "messageId" to messageId,
          "fileName" to fileName,
          "status" to "completed",
          "localUri" to result.contentUri
        ))

        // ✅ Return full metadata (like old module's save function)
        mapOf(
          "success" to true,
          "messageId" to messageId,
          "fileName" to fileName,
          "folderName" to result.folderPath,  // e.g., "DCIM/Chatbasket/images"
          "mimeType" to mimeType,
          "directory" to result.directory,  // e.g., "DCIM" or "Download"
          "localUri" to result.contentUri,  // content:// URI
          "fileSize" to fileSize,
          "savedPath" to "${result.folderPath}/$fileName"
        )

      } catch (e: IOException) {
        // ✅ Priority 3: File I/O errors (corrupt file, file locked, read/write failure)
        sendEvent("onSaveComplete", mapOf(
          "messageId" to messageId,
          "fileName" to fileName,
          "status" to "failed",
          "error" to "File I/O error: ${e.message}"
        ))
        throw CodedException("ERR_IO_FAILURE", "File I/O error: ${e.message}", e)
        
      } catch (e: SecurityException) {
        // ✅ Priority 3: Permission denied (for Android 9 and below)
        sendEvent("onSaveComplete", mapOf(
          "messageId" to messageId,
          "fileName" to fileName,
          "status" to "failed",
          "error" to "Permission denied"
        ))
        throw CodedException("ERR_PERMISSION_DENIED", "Storage permission denied: ${e.message}", e)
        
      } catch (e: Exception) {
        // ✅ Generic fallback for any other errors
        sendEvent("onSaveComplete", mapOf(
          "messageId" to messageId,
          "fileName" to fileName,
          "status" to "failed",
          "error" to (e.message ?: "Unknown error")
        ))
        throw CodedException("ERR_SAVE_FAILED", "Failed to save file: ${e.message}", e)
      }
    }

    // ✅ Check if file exists (from old module)
    AsyncFunction("checkFileExists") { filePath: String ->
      try {
        val cleanPath = filePath.replace("file://", "")
        val file = File(cleanPath)
        
        mapOf(
          "exists" to file.exists(),
          "size" to if (file.exists()) file.length() else 0,
          "path" to filePath
        )
      } catch (e: Exception) {
        mapOf(
          "exists" to false,
          "size" to 0,
          "path" to filePath,
          "error" to e.message
        )
      }
    }

    // ✅ NEW: Get file info from MediaStore
    AsyncFunction("getFileInfo") { contentUri: String ->
      try {
        val uri = android.net.Uri.parse(contentUri)
        val resolver = appContext.reactContext?.contentResolver
          ?: throw CodedException("ERR_NO_CONTEXT", "React context not available", null)

        val projection = arrayOf(
          MediaStore.MediaColumns.DISPLAY_NAME,
          MediaStore.MediaColumns.SIZE,
          MediaStore.MediaColumns.MIME_TYPE,
          MediaStore.MediaColumns.DATE_ADDED
        )

        resolver.query(uri, projection, null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            val nameIndex = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE)
            val mimeIndex = cursor.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE)
            val dateIndex = cursor.getColumnIndex(MediaStore.MediaColumns.DATE_ADDED)

            mapOf(
              "exists" to true,
              "fileName" to cursor.getString(nameIndex),
              "size" to cursor.getLong(sizeIndex),
              "mimeType" to cursor.getString(mimeIndex),
              "dateAdded" to cursor.getLong(dateIndex)
            )
          } else {
            mapOf("exists" to false)
          }
        } ?: mapOf("exists" to false)
      } catch (e: Exception) {
        mapOf(
          "exists" to false,
          "error" to e.message
        )
      }
    }

    // ✅ NEW: Delete saved file from MediaStore
    AsyncFunction("deleteFile") { contentUri: String ->
      try {
        val uri = android.net.Uri.parse(contentUri)
        val resolver = appContext.reactContext?.contentResolver
          ?: throw CodedException("ERR_NO_CONTEXT", "React context not available", null)

        val deleted = resolver.delete(uri, null, null)
        deleted > 0
      } catch (e: Exception) {
        throw CodedException("ERR_DELETE_FAILED", "Failed to delete file: ${e.message}", e)
      }
    }
  }

  private data class SaveResult(
    val contentUri: String,
    val folderPath: String,
    val directory: String
  )

  private fun saveFile(
    resolver: android.content.ContentResolver,
    collection: android.net.Uri,
    values: ContentValues,
    file: File
  ): String {
    val uri = resolver.insert(collection, values)
      ?: throw Exception("Failed to create MediaStore entry")

    resolver.openOutputStream(uri).use { outputStream ->
      FileInputStream(file).use { inputStream ->
        inputStream.copyTo(outputStream!!)
      }
    }

    return uri.toString()
  }

  private fun getDownloadSubfolder(mimeType: String): String {
    return when {
      mimeType == "application/pdf" -> "documents"
      mimeType.contains("word") -> "documents"
      mimeType.contains("excel") || mimeType.contains("spreadsheet") -> "documents"
      mimeType.contains("powerpoint") || mimeType.contains("presentation") -> "documents"
      mimeType == "text/plain" -> "documents"
      mimeType == "text/csv" -> "documents"
      mimeType.startsWith("audio/") -> "audio"
      else -> "files"
    }
  }

  private fun getMimeType(filename: String): String {
    val extension = filename.substringAfterLast('.', "").lowercase()
    return when (extension) {
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      "gif" -> "image/gif"
      "webp" -> "image/webp"
      "heic" -> "image/heic"
      "heif" -> "image/heif"
      "bmp" -> "image/bmp"
      "svg" -> "image/svg+xml"
      "mp4" -> "video/mp4"
      "mov" -> "video/quicktime"
      "avi" -> "video/x-msvideo"
      "mkv" -> "video/x-matroska"
      "webm" -> "video/webm"
      "3gp" -> "video/3gpp"
      "flv" -> "video/x-flv"
      "mp3" -> "audio/mpeg"
      "wav" -> "audio/wav"
      "ogg" -> "audio/ogg"
      "m4a" -> "audio/mp4"
      "flac" -> "audio/flac"
      "aac" -> "audio/aac"
      "pdf" -> "application/pdf"
      "doc" -> "application/msword"
      "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      "xls" -> "application/vnd.ms-excel"
      "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      "ppt" -> "application/vnd.ms-powerpoint"
      "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      "txt" -> "text/plain"
      "csv" -> "text/csv"
      "zip" -> "application/zip"
      "rar" -> "application/x-rar-compressed"
      "7z" -> "application/x-7z-compressed"
      "tar" -> "application/x-tar"
      "gz" -> "application/gzip"
      "apk" -> "application/vnd.android.package-archive"
      else -> "application/octet-stream"
    }
  }

  // ✅ Priority 2: Helper function to check available storage space
  private fun getAvailableStorageSpace(): Long {
    return try {
      val statFs = StatFs(Environment.getExternalStorageDirectory().absolutePath)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
        statFs.availableBlocksLong * statFs.blockSizeLong
      } else {
        @Suppress("DEPRECATION")
        statFs.availableBlocks.toLong() * statFs.blockSize.toLong()
      }
    } catch (e: Exception) {
      // If we can't determine space, return a very large number to avoid false positives
      Long.MAX_VALUE
    }
  }
}
