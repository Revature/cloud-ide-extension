import fs from 'fs';

interface config {
  runnerAuth:string,
  monolithUrl:string,
  runnerId:number
}

interface runner {
  session_start:string,
  session_end:string,
  user_id:number
}

interface devserver {
  url:string
}

export let config : config =  {
  runnerAuth:"", 
  monolithUrl:"",
  runnerId:0
}

export let runner : runner = {
  session_start:"",
  session_end:"",
  user_id:0
}

export let devserver : devserver = {
  url : ""
}

export function getConfig(): config {
  try{
    const configContent = fs.readFileSync("/home/ubuntu/.cloudide.config", 'utf8');
    let data : any =  JSON.parse(configContent);
    config = data;
  }catch{
    throw Error ("Config error! Issue reading config file")
  }
  
  if (config.runnerAuth == null || config.runnerAuth == undefined){
    throw Error("Config error! no runnerAuth provided.")
  }
  if (config.monolithUrl == null || config.monolithUrl == undefined){
    throw Error("Config error! no monolithUrl provided.")
  }
  if (config.runnerId == 0 || config.runnerId == undefined){
    throw Error("Config error! no runnerId provided.")
  }
  
  return config;
}