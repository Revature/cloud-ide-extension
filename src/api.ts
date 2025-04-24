import { config, runner } from "./data";
const apiVersion = "v1"

export function getRunnerInfo() {
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}`,
        {headers: {
                'Content-Type': 'application/json',
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
            }
        }
    )
}

export function addTime(){
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}`,
        {headers: {
                'Content-Type': 'application/json',
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
            },
            body:JSON.stringify({})
        }
    )
}

export function getDevServer(){
    return fetch(`${config.monolithUrl}/api/${apiVersion}/runners/${config.runnerId}`,
        {headers: {
                'Content-Type': 'application/json',
                'Auth-Token': config.runnerAuth,
                'Runner-Token': config.runnerAuth
            }
        }
    )
}

export function getNotifications(){

}