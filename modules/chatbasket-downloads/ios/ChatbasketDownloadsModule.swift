import ExpoModulesCore

public class ChatbasketDownloadsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChatbasketDownloads")
    
    // Event for save completion
    Events("onSaveComplete")

    // Android-only: Save function
    AsyncFunction("save") { (localUri: String, fileName: String, messageId: String) in
      throw UnavailabilityError("ChatbasketDownloads.save() is only available on Android")
    }

    // Android-only: Check if file exists
    AsyncFunction("checkFileExists") { (filePath: String) in
      throw UnavailabilityError("ChatbasketDownloads.checkFileExists() is only available on Android")
    }

    // Android-only: Get file info from MediaStore
    AsyncFunction("getFileInfo") { (contentUri: String) in
      throw UnavailabilityError("ChatbasketDownloads.getFileInfo() is only available on Android")
    }

    // Android-only: Delete file from MediaStore
    AsyncFunction("deleteFile") { (contentUri: String) in
      throw UnavailabilityError("ChatbasketDownloads.deleteFile() is only available on Android")
    }
  }
}
