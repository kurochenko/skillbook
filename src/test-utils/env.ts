export const withLibraryEnv = (libraryPath: string) => {
  const originalLibrary = process.env.SKILLBOOK_LIBRARY
  process.env.SKILLBOOK_LIBRARY = libraryPath

  return () => {
    if (originalLibrary !== undefined) {
      process.env.SKILLBOOK_LIBRARY = originalLibrary
    } else {
      delete process.env.SKILLBOOK_LIBRARY
    }
  }
}
