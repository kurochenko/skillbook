export const withLibraryEnv = (libraryPath: string) => {
  const originalLibrary = process.env.SKILLBOOK_LIBRARY
  const originalLockLibrary = process.env.SKILLBOOK_LOCK_LIBRARY
  process.env.SKILLBOOK_LIBRARY = libraryPath
  process.env.SKILLBOOK_LOCK_LIBRARY = libraryPath

  return () => {
    if (originalLibrary !== undefined) {
      process.env.SKILLBOOK_LIBRARY = originalLibrary
    } else {
      delete process.env.SKILLBOOK_LIBRARY
    }

    if (originalLockLibrary !== undefined) {
      process.env.SKILLBOOK_LOCK_LIBRARY = originalLockLibrary
    } else {
      delete process.env.SKILLBOOK_LOCK_LIBRARY
    }
  }
}
