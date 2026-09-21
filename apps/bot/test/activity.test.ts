import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicChat} from '../src/imvu/activity.ts';
test('only explicit broadcast to the active chat is captured',()=>{
 assert.equal(publicChat(0,'/chat/1','1','/chat/1','1'),true);
 assert.equal(publicChat('0','/chat/1','1','/chat/1','1'),true);
 for(const to of [undefined,null,123,'123'])assert.equal(publicChat(to,'/chat/1','1','/chat/1','1'),false);
 assert.equal(publicChat(0,'/chat/2','2','/chat/1','1'),false);
 assert.equal(publicChat(0,'/chat/1','2','/chat/1','1'),false);
});
