// A single serialized transition controls the one shared bot/player pair.
// Dependencies are injected so failure and recovery paths can be tested without IMVU.
export function createRoomController(deps, initial, storedOperation=null) {
  let active=initial;
  let operation=storedOperation;
  let running=false;
  async function saveActive(value){await deps.saveActive(value);active=value;deps.onActive(value);}
  async function phase(value){operation.phase=value;await deps.saveOperation(operation);}
  async function rollback(){
    await phase('restoring');
    await deps.control('stop');
    await deps.stopAudio();
    await saveActive(operation.previous);
    if(operation.previousBot){await deps.control('start-bot');await deps.waitJoined(active);}
    if(operation.previousPlayer)await deps.control('start-player');
  }
  async function run(){
    try{
      await phase('stopping');
      await deps.control('stop');
      await deps.stopAudio();
      await deps.release(operation.previous.roomId);
      await phase('joining');
      await saveActive(operation.target);
      await deps.control('start-bot');
      await deps.waitJoined(active);
      await phase('starting-player');
      await deps.control('start-player');
      operation={...operation,status:'done',phase:'ready',error:null};
    }catch(error){
      const reason=error.message==='ROOM_JOIN_TIMEOUT'?'ROOM_JOIN_TIMEOUT':'ROOM_SWITCH_FAILED';
      try{await rollback();operation={...operation,status:'failed',phase:'restored',error:reason};}
      catch{await deps.control('stop').catch(()=>{});operation={...operation,status:'failed',phase:'stopped',error:'ROOM_RECOVERY_FAILED'};}
    }finally{running=false;await deps.saveOperation(operation);}
  }
  return {
    get active(){return active;},
    get switching(){return running;},
    get operation(){return operation?{status:operation.status,phase:operation.phase,error:operation.error,targetRoomId:operation.target.roomId}:null;},
    async begin(target){
      if(running)throw new Error('ROOM_SWITCH_IN_PROGRESS');
      running=true;
      try{
        const states=await deps.states();
        operation={status:'switching',phase:'preparing',error:null,previous:active,target,previousBot:states.bot,previousPlayer:states.player};
        await deps.saveOperation(operation);
      }catch(error){running=false;throw error;}
      // Errors are stored for the UI; never leak rejection from a detached transition.
      void run().catch(()=>{running=false;operation={...operation,status:'failed',phase:'stopped',error:'ROOM_RECOVERY_FAILED'};});
    },
    async recover(){
      if(!operation||operation.status!=='switching')return;
      running=true;
      try{await rollback();operation={...operation,status:'failed',phase:'restored',error:'ROOM_SWITCH_INTERRUPTED'};}
      catch{await deps.control('stop').catch(()=>{});operation={...operation,status:'failed',phase:'stopped',error:'ROOM_RECOVERY_FAILED'};}
      finally{running=false;await deps.saveOperation(operation);}
    },
  };
}
