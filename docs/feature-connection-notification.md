# Connection Notification Feature Implementation

## Overview
Send an API request to the backend when a user connects to the IDE (extension activation). This allows the backend to track active connections and update runner status.

## Implementation Steps

### 1. API Endpoint
- Add `notifyConnection()` function to `api.ts`
- Endpoint: `PATCH /runner/{runnerId}/connected/`
- Uses existing `getHeaders()` for authentication
- Payload: `{ "last_connected": "<ISO timestamp>" }`

### 2. Call on Activation
- Invoke `notifyConnection()` in `extension.ts` `activate()` function
- Call after `getConfig()` and `updateRunnerData()` complete
- Fire-and-forget pattern (don't block activation on response)

### 3. Error Handling
- Log warning on failure, don't show user notification
- No retry logic (single attempt)
- Activation should continue regardless of API success/failure

## Files to Modify (Extension)
- `src/api.ts` - add `notifyConnection()` function
- `src/extension.ts` - call notification on activation

## Backend Endpoint (FastAPI - separate project)

New USER-accessible endpoint in `runner_router.py`:

```python
class ConnectionUpdate(BaseModel):
    """Payload for connection notification."""
    last_connected: datetime = Field(default_factory=datetime.utcnow)

@patch("/{runner_id}/connected/", workos=UserRole.USER, response_model=Runner)
async def notify_connected(
    self,
    request: Request,
    runner_id: str,
    payload: ConnectionUpdate
) -> Runner:
    """Record IDE connection for a runner. User must own the runner."""
    user = getattr(request.state, 'user', None)
    runner = await self.runner_service.get_runner_by_id(runner_id)
    runner_auth.require_access(user=user, resource=runner, resource_id=runner_id)

    # Update runner with connection timestamp
    update = RunnerUpdate(last_connected=payload.last_connected)
    return await self.runner_service.tx_manager.partial_update(runner_id, update)
```

Requires adding `last_connected: Optional[datetime]` field to the `Runner` and `RunnerUpdate` models.

## API Function

```typescript
// api.ts
export function notifyConnection() {
    return fetch(`${runnerConfig.backendUrl}/runner/${runnerConfig.runnerId}/connected/`, {
        headers: getHeaders(),
        method: "PATCH",
        body: JSON.stringify({
            last_connected: new Date().toISOString()
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to notify connection: ${response.status} ${response.statusText}`);
        }
        return response;
    });
}
```

## Extension Integration

```typescript
// extension.ts (in activate function, after updateRunnerData)
import { notifyConnection } from './api';

// Fire-and-forget connection notification
notifyConnection().catch(err => console.warn('Connection notification failed:', err));
```

## Considerations

### Payload Data
- Should we send additional metadata?
  - Timestamp
  - Extension version
  - VSCode version
  - Browser info (if available)

### Retry Logic
- Current design: no retries
- Alternative: single retry after short delay
- Backend should handle duplicate notifications gracefully

### Backend Connection State
- Should we skip if `backendConnectionState.isConnected` is already false from `updateRunnerData()`?
- Or attempt anyway since this is a separate concern?

### Logging
- Use existing `log()` function from `logger.ts` for consistency?
- Or just `console.warn()` for errors?

### Timing
- Currently: after `updateRunnerData()` completes
- Alternative: in parallel with `updateRunnerData()` for faster startup

### Deactivation Notification
- Should we also notify on disconnect (extension deactivate)?
- Would require a `notifyDisconnection()` API call in `deactivate()`
