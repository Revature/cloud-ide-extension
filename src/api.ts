import { config, runner } from "./data";
const apiVersion = "v1"

export function getRunnerInfo() {
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}`,
        {
            headers: {
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
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
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}/extend_session`,
        {
            headers: {
                'Content-Type': 'application/json',
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
            },
            method: "PUT",
            body: JSON.stringify({
                runner_id: config.runnerId,
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
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}/devserver?port=${port}`,
        {
            headers: {
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
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
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}/notifications`,
        {
            headers: {
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
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