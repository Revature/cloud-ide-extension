import fs from 'fs';

interface runnerConfig {
  runnerAuth:string,
  monolithUrl:string,
  runnerId:number,
  maxSessionTime:number,
  sessionStart:string,
  userId:number,
  filePath:string | null,
  oaiKey: string | null,
  ollamaKey: string | null
}

interface runnerState {
  sessionEnd:string,
}

export let runnerConfig : runnerConfig =  {
  runnerAuth: "",
  monolithUrl: "",
  runnerId: 0,
  maxSessionTime: 0,
  sessionStart: '',
  userId: 0,
  filePath: null,
  oaiKey: null,
  ollamaKey: null
}

export let runnerState : runnerState = {
  sessionEnd:""
}

export const expiryNotificationTime = 10;
export const addTimeAmount = 30;

export function getConfig() {
  try{
    const runnerConfigContent = fs.readFileSync("/home/ubuntu/.cloudide.config", 'utf8');
      runnerConfig =  JSON.parse(runnerConfigContent);
  }catch{
    throw Error ("Config error! Issue reading runner config file")
  }
  
  if (runnerConfig.runnerAuth == null || runnerConfig.runnerAuth == undefined){
    throw Error("Config error! no runnerAuth provided.")
  }
  if (runnerConfig.monolithUrl == null || runnerConfig.monolithUrl == undefined){
    throw Error("Config error! no monolithUrl provided.")
  }
  if (runnerConfig.runnerId == 0 || runnerConfig.runnerId == undefined){
    throw Error("Config error! no runnerId provided.")
  }
  if (runnerConfig.maxSessionTime == 0 || runnerConfig.maxSessionTime == undefined){
    throw Error("Config error! no maxSessionTime provided.")
  }
  if (runnerConfig.userId == 0 || runnerConfig.userId == undefined){
    throw Error("Config error! no userId provided.")
  }
  if (runnerConfig.sessionStart == null || runnerConfig.sessionStart == undefined){
    throw Error("Config error! no sessionStart provided.")
  }
}