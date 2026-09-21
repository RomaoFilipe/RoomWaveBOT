import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WelcomeTracker,renderWelcome} from '../src/imvu/welcome-state.ts';
test('silent baseline, new arrivals, self exclusion and re-entry cooldown',()=>{
 const t=new WelcomeTracker(),a={id:'1',name:'A'},b={id:'2',name:'B'},bot={id:'9',name:'Bot'};
 assert.equal(t.observe([a,bot],'9',true,1000),null);
 assert.equal(t.observe([a,b,bot],'9',true,2000)?.id,'2');
 assert.equal(t.observe([a,b,bot],'9',true,3000),null);
 t.observe([a],'9',true,4000);
 assert.equal(t.observe([a,b,bot],'9',true,5000),null);
 t.observe([a],'9',true,603000);
 assert.equal(t.observe([a,b],'9',true,604000)?.id,'2');
});
test('disabled mode, failed connection baseline and pending leavers stay silent',()=>{
 const t=new WelcomeTracker(),a={id:'1',name:'A'},b={id:'2',name:'B'};
 t.observe([],'9',true,0);t.observe([a,b],'9',true,1000);
 assert.equal(t.observe([a],'9',true,2000),null);
 t.reset();assert.equal(t.observe([a,b],'9',true,3000),null);
 assert.equal(t.observe([],'9',false,4000),null);
 assert.equal(t.observe([a,b],'9',false,5000),null);
});
test('template keeps substitutions literal and limits chat length',()=>{
 assert.equal(renderWelcome('Olá {nome}, {sala}: {radio}','$&\nX','Sala','https://radio'),'Olá $& X, Sala: https://radio');
 assert.equal(renderWelcome('x'.repeat(600),'A','B','C').length,500);
});
