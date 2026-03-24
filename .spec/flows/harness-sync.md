---
type: flow
name: Harness sync (no --id)
id: flow:harness-sync
context: skillbook
---

## Flow: `harness sync` (no --id)

**Trigger:** User runs `skillbook harness sync` without `--id` argument

**Steps:**

1. Read project's lock file
2. Extract `lock.harnesses` array
3. **If `lock.harnesses` is empty:**
   - Log info message about no harnesses enabled
   - Show guidance to use `--id all` or `harness add`
   - Exit with code 0
4. **If harnesses exist in lock:**
   - For each harness in `lock.harnesses`:
     a. Determine sync mode (from `lock.harnessModes` or default to symlink)
     b. Sync all project skills to harness folder
     c. Report results
