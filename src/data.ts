import fs from 'fs';

interface runnerConfig {
  runnerId: string,
  userId: string,
  sessionStart: string,
  maxSessionTime: number,
  sessionEnd: string,
  backendUrl: string,
  auth: string | null
}

interface runnerState {
  sessionEnd: string,
}

export let runnerConfig: runnerConfig = {
  runnerId: "",
  userId: "",
  sessionStart: "",
  maxSessionTime: 0,
  sessionEnd: "",
  backendUrl: "",
  auth: null
}

export let runnerState: runnerState = {
  sessionEnd: ""
}

export let backendConnectionState = {
  isConnected: true,
  lastError: null as string | null
}

export const expiryNotificationTime = 10;
export const addTimeAmount = 30;

export function getConfig() {
  try {
    const runnerConfigContent = fs.readFileSync("/home/ubuntu/.cloudide.config", 'utf8');
    runnerConfig = JSON.parse(runnerConfigContent);
  } catch {
    throw Error("Config error! Issue reading runner config file")
  }

  if (runnerConfig.backendUrl == null || runnerConfig.backendUrl == undefined) {
    throw Error("Config error! no backendUrl provided.")
  }
  if (runnerConfig.runnerId == null || runnerConfig.runnerId == undefined || runnerConfig.runnerId === "") {
    throw Error("Config error! no runnerId provided.")
  }
  if (runnerConfig.maxSessionTime == 0 || runnerConfig.maxSessionTime == undefined) {
    throw Error("Config error! no maxSessionTime provided.")
  }
  if (runnerConfig.userId == null || runnerConfig.userId == undefined || runnerConfig.userId === "") {
    throw Error("Config error! no userId provided.")
  }
  if (runnerConfig.sessionStart == null || runnerConfig.sessionStart == undefined) {
    throw Error("Config error! no sessionStart provided.")
  }
  if (runnerConfig.sessionEnd == null || runnerConfig.sessionEnd == undefined) {
    throw Error("Config error! no sessionEnd provided.")
  }
}