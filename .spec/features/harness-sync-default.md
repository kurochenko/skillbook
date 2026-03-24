---
type: feature
name: Default harness sync syncs all configured harnesses
id: feat:harness-sync-default
context: skillbook
links:
  - edge: includes
    target: flow:harness-sync
---

When running `skillbook harness sync` without `--id`, the command reads the project's lock file and syncs skills to all harnesses listed in `lock.harnesses`.

If `lock.harnesses` is empty (no harnesses have been enabled for this project), the command exits early with:

```
No harnesses enabled for this project. To enable all harnesses, run:
  skillbook harness sync --id all

Or enable specific harnesses with:
  skillbook harness add --id <harness>
```

**Behavior matrix:**

| Command | Behavior |
|---------|----------|
| `harness sync` | Sync all harnesses in `lock.harnesses` |
| `harness sync --id all` | Sync all `SUPPORTED_TOOLS` |
| `harness sync --id <harness>` | Sync only specified harness |
| `harness sync` (no harnesses in lock) | Show message, exit with code 0 |
