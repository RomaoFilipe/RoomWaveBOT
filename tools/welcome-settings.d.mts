export interface WelcomeSettings {enabled:boolean;message:string}
export const defaultWelcome: WelcomeSettings;
export function readWelcome(id:string):Promise<WelcomeSettings>;
export function writeWelcome(id:string,value:WelcomeSettings):Promise<WelcomeSettings>;
