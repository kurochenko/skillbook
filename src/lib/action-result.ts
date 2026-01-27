export type ActionResult =
  | { success: true }
  | { success: false; error: string }
