export const withLibraryEnv = (libraryPath: string) => {
  const original = process.env.SKILLBOOK_LIBRARY
  process.env.SKILLBOOK_LIBRARY = libraryPath

  return () => {
    if (original !== undefined) {
      process.env.SKILLBOOK_LIBRARY = original
    } else {
      delete process.env.SKILLBOOK_LIBRARY
    }
  }
}
