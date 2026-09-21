export interface WatchedPerson {id:string;username:string;note:string;updatedAt?:string}
export function readSecurity(id:string):Promise<{people:WatchedPerson[]}>;
export function changePerson(id:string,person:WatchedPerson,remove?:boolean):Promise<{people:WatchedPerson[]}>;
