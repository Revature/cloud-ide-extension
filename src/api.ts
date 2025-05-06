import { runnerConfig, runnerState } from "./data";
const apiVersion = "v1"

export function getRunnerInfo() {
    return fetch(`${runnerConfig.monolithUrl}/api/${apiVersion}/runners/${runnerConfig.runnerId}`,
        {
            headers: {
                'Auth-Token': runnerConfig.runnerAuth,
                'Runner-Token': runnerConfig.runnerAuth
            }
        }
    )
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to get runner info: ${response.status} ${response.statusText}`);
        }
        return response;
    });
}

export function addTime(minutes: number) {
    return fetch(`${runnerConfig.monolithUrl}/api/${apiVersion}/runners/${runnerConfig.runnerId}/extend_session`,
        {
            headers: {
                'Content-Type': 'application/json',
                'Auth-Token': runnerConfig.runnerAuth,
                'Runner-Token': runnerConfig.runnerAuth
            },
            method: "PUT",
            body: JSON.stringify({
                runner_id: runnerConfig.runnerId,
                extra_time: minutes
            })
        }
    )
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to add time: ${response.status} ${response.statusText}`);
        }
        return response;
    });
}

export function getDevServer(port: number) {
    return fetch(`${runnerConfig.monolithUrl}/api/${apiVersion}/runners/${runnerConfig.runnerId}/devserver?port=${port}`,
        {
            headers: {
                'Auth-Token': runnerConfig.runnerAuth,
                'Runner-Token': runnerConfig.runnerAuth
            }
        }
    )
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to get dev server for port ${port}: ${response.status} ${response.statusText}`);
        }
        return response;
    });
}

export function getNotifications() {
    // Implementation for notifications API
    return fetch(`${runnerConfig.monolithUrl}/api/${apiVersion}/runners/${runnerConfig.runnerId}/notifications`,
        {
            headers: {
                'Auth-Token': runnerConfig.runnerAuth,
                'Runner-Token': runnerConfig.runnerAuth
            }
        }
    )
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to get notifications: ${response.status} ${response.statusText}`);
        }
        return response;
    });
}