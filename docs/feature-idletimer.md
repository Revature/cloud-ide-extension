# Idle Timer Feature Implementation

## Overview
Add functionality to detect user idle time, warn the user via modal, and terminate the VM session if no activity is detected. Auto-save work to git before termination.

## Implementation Steps

### 1. Idle Timer
- Track `lastActivityTime` timestamp
- Run a check every 30 seconds via `setInterval`
- Two thresholds:
  - Warning threshold (e.g., 15 min) - show modal
  - Termination threshold (e.g., 17 min) - trigger save + API

### 2. Activity Detection
- Listen to VSCode events indicating user activity:
  - `onDidChangeActiveTextEditor`
  - `onDidChangeTextEditorSelection`
  - `onDidChangeTextDocument`
  - `onDidChangeWindowState`
- Each event resets `lastActivityTime` to `Date.now()`

### 3. Modal Window
- Use `vscode.window.showWarningMessage()` with `{ modal: true }`
- Non-blocking (use `.then()` not `await`)
- "Stay Connected" button resets the idle timer when clicked
- Track modal state to prevent duplicate modals

### 4. Git Auto-Save (before termination)
- Save all open files (`vscode.workspace.saveAll()`)
- `git add .`
- `git commit -m "Auto-save before idle termination"`
- `git push`
- Handle errors gracefully (don't block termination if git fails)

### 5. API Call for Termination
- Add `terminateRunner()` function to `api.ts`
- Endpoint: `POST /runner/{id}/terminate/` (TBD)
- Called after git operations complete

### 6. Cleanup & Edge Cases
- Stop timer on extension deactivate
- Prevent multiple terminate calls
- Handle API errors gracefully
- Consider interaction with existing session expiry modals

## Files to Modify
- `src/api.ts` - add terminate API call
- `src/data.ts` - add timeout config values
- `src/extension.ts` - wire up idle detection
- `src/idle.ts` (new) - idle detection logic

## Configuration Values
- `idleWarningMinutes` - time before showing warning modal
- `idleTerminationMinutes` - time before terminating session

## Considerations

### Cleanup on Deactivate
- Stop the interval timer when the extension deactivates (like `stopGlobalExpiryCheck()` in existing code)

### After Termination
- Stop the idle timer?
- Show a "Session terminated" message?
- Prevent multiple terminate calls?

### Error Handling
- What if the terminate API call fails? Retry? Ignore?

### Interaction with Session Expiry
- Existing code in `session.ts` already shows modals for session expiry
- Could both modals appear at once?
- Should idle detection pause if a session expiry modal is active?

### Config Source
- Should timeout values be hardcoded or loaded from the config file like other settings in `data.ts`?

### Backend Connection
- Should we skip termination if `backendConnectionState.isConnected` is false?