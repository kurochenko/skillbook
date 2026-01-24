---
name: atlassian-jira
description: Use when creating Jira tickets in ScrollFinance SCR project. Contains project details, issue types (Bug/Task), sprint assignment, labels (BE/FE), story point estimation, and source attribution requirements for bugs from Sentry, CloudWatch, or other monitoring tools.
---

# Jira for ScrollFinance

## Instance Details

- **URL**: https://scrollfinance.atlassian.net/
- **Cloud ID**: `5710d170-51cb-4309-a71e-f8a98b3b4091`

## Project Configuration

| Field | Value |
|-------|-------|
| **Project Key** | SCR |
| **Bug Issues** | Use issue type `Bug` |
| **Non-Bug Issues** | Use issue type `Task` |

## Sprint Assignment

Always add tickets to the **latest active sprint**. Query active sprints before creating tickets.

## Labels

| Ticket Type | Label |
|-------------|-------|
| Backend work | `BE` |
| Frontend work | `FE` |

## Assignee

Default to assigning tickets to the current user (self).

## Story Points

Estimate story points based on complexity and effort:

| SP | Size | Description | Duration |
|----|------|-------------|----------|
| **1** | Tiny | Almost trivial, very simple, no doubts | Few hours max |
| **2** | Small | Easy, clear scope, low effort | ~1 day |
| **3** | Small-Medium | Still clear, but needs a bit more work | 2-3 days |
| **5** | Medium | Some dependencies or coordination needed, well understood | ~1 week |
| **8** | Large | More moving parts, some unknowns | 1-1.5 weeks |
| **13** | Very Large | Complex, not fully clear, may need research or PoC | Up to 2 weeks |
| **21** | Huge | Lots of uncertainty, cannot be estimated reliably | Needs breakdown |

**Rule**: If estimated at 21 SP, break down the work into smaller tickets before planning.

---

## Source Attribution (Critical)

Always document the source of issues and provide context for what, why, and how.

### For Sentry Bugs

Include in the ticket description:

1. **Link to Sentry issue** (e.g., `https://scroll-finance.sentry.io/issues/BACKEND-XX`)
2. **Error message/exception type**
3. **Affected endpoint or component**
4. **Environment** (dev/staging/prod)
5. **Frequency and user impact**

### For CloudWatch Issues

Include in the ticket description:

1. **Example log snippets** (relevant entries)
2. **Log query used** to find the issue
3. **Time range** when issue occurred
4. **Affected service/namespace**

### For All Issues

Always explain:

1. **What was happening** - Describe the symptom/error
2. **Why it was happening** - Root cause analysis
3. **How we are fixing it** - Solution approach

---

## Ticket Templates

### Bug from Sentry

```
## Problem
[Brief description of the error]

## Sentry Issue
[Full URL to the Sentry issue]

## Affected
- **Endpoint**: [e.g., PUT /application/validation/v1/validation/{id}/remove-document]
- **Environment**: [dev/staging/prod]
- **Occurrences**: [count]
- **Users Impacted**: [count]

## Root Cause
[Explanation of why this is happening]

## Solution
[How we're fixing it]

## Environments
[Which environments need the fix: dev, staging, prod]
```

### Bug from CloudWatch

```
## Problem
[Brief description]

## CloudWatch Evidence
**Log Group**: [log group name]
**Query Used**:
\`\`\`
[CloudWatch Insights query]
\`\`\`

**Example Logs**:
\`\`\`
[Relevant log entries]
\`\`\`

**Time Range**: [start] to [end]
**Affected Service**: [service name]

## Root Cause
[Explanation]

## Solution
[Fix approach]
```

### Task (Non-Bug)

```
## Summary
[What needs to be done]

## Context
[Why this is needed]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Technical Approach
[How to implement]
```

---

## Creating Tickets via MCP

Use the Atlassian MCP tools in this order:

1. **Get cloud ID** (if needed):
   ```
   atlassian_getAccessibleAtlassianResources()
   ```

2. **Get current user** (for assignment):
   ```
   atlassian_atlassianUserInfo()
   ```

3. **Find active sprint**:
   ```
   atlassian_searchJiraIssuesUsingJql(
     cloudId: "scrollfinance.atlassian.net",
     jql: "project = SCR AND sprint in openSprints() ORDER BY created DESC"
   )
   ```

4. **Create the ticket**:
   ```
   atlassian_createJiraIssue(
     cloudId: "scrollfinance.atlassian.net",
     projectKey: "SCR",
     issueTypeName: "Bug" or "Task",
     summary: "[Title]",
     description: "[Markdown description]",
     assignee_account_id: "[user account id]"
   )
   ```

5. **Add labels and story points** (after creation):
   ```
   atlassian_editJiraIssue(
     cloudId: "scrollfinance.atlassian.net",
     issueIdOrKey: "SCR-XXX",
     fields: {
       "labels": ["BE"],
       "customfield_XXXXX": 3  // Story points field
     }
   )
   ```

---

## Tips

- Always search for existing similar tickets before creating new ones
- Link related tickets when applicable
- For urgent production issues, mention severity in the summary
- Include screenshots or stack traces when helpful
