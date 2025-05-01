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
}

export function addTime(minutes:number){
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}/extend_session`,
        {
            headers: {
                'Content-Type': 'application/json',
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
            },
            method:"PUT",
            body:JSON.stringify({
                runner_id: config.runnerId,
                extra_time:minutes
            })
        }
    )
}

export function getDevServer(port: number){
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}/devserver?port=${port}`,
        {headers: {
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
            }
        }
    )
}

export function getNotifications(){

}