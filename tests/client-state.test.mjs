import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountRefresher} from '../src/account-state.js';
import {createProgressQueue} from '../src/progress-sync.js';
import {loadStory} from '../src/story-loader.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
const session=id=>({user:{id}});
const snapshot=(id,favorite)=>({user:{id},subscription:{status:'active'},hasAccess:true,progress:[{story_id:2,part:1,completed:false,favorite}]});
test('resposta da conta anterior não altera a nova conta nem seu cache',async()=>{
 const pending=deferred(),saved=[],state={session:session('alice'),progress:{}};
 const refresh=createAccountRefresher(state,{request:()=>pending.promise,readLocal:()=>({}),writeLocal:(p,id)=>saved.push(id),notify:()=>{}});
 const running=refresh();state.session=session('bob');state.progress={};state.hasAccess=false;
 pending.resolve(snapshot('alice',true));await running;
 assert.deepEqual(saved,[]);assert.deepEqual(state.progress,{});assert.equal(state.hasAccess,false);
});
test('refresh antigo da mesma conta não desfaz um refresh mais recente',async()=>{
 const a=deferred(),b=deferred(),calls=[a,b],state={session:session('alice'),progress:{}};
 const refresh=createAccountRefresher(state,{request:()=>calls.shift().promise,readLocal:()=>({}),writeLocal:()=>{},notify:()=>{}});
 const first=refresh(),second=refresh();b.resolve(snapshot('alice',false));await second;a.resolve(snapshot('alice',true));await first;
 assert.equal(state.progress[2].favorite,false);
});
test('logout descarta uma resposta pendente sem recriar a assinatura',async()=>{
 const pending=deferred(),state={session:session('alice'),progress:{}};
 const refresh=createAccountRefresher(state,{request:()=>pending.promise,readLocal:()=>({}),writeLocal:()=>{},notify:()=>{}});
 const running=refresh();state.session=null;await refresh();pending.resolve(snapshot('alice',true));await running;
 assert.equal(state.subscription,null);assert.equal(state.hasAccess,false);assert.deepEqual(state.progress,{});
});
test('fila preserva última escolha de favorito sob latência e captura o valor original',async()=>{
 const gates=[],writes=[],queue=createProgressQueue(async(userId,row)=>{writes.push({userId,row});const gate=deferred();gates.push(gate);await gate.promise;});
 const row={story_id:2,favorite:true};const first=queue('alice',row);row.favorite=false;const second=queue('alice',row);
 await new Promise(r=>setImmediate(r));assert.equal(writes.length,1);assert.equal(writes[0].row.favorite,true);
 gates[0].resolve();await first;await new Promise(r=>setImmediate(r));assert.equal(writes.length,2);assert.equal(writes[1].row.favorite,false);gates[1].resolve();await second;
});
test('falha anterior não bloqueia a próxima sincronização',async()=>{
 let calls=0;const queue=createProgressQueue(async()=>{if(++calls===1)throw new Error('offline');});
 await assert.rejects(queue('alice',{story_id:2}),/offline/);await queue('alice',{story_id:2});assert.equal(calls,2);
});
test('assinante recebe a narração publicada também na história1',async()=>{
 const story=await loadStory(1,{member:true,fetchSample:()=>{throw new Error('A amostra não deve esconder a narração');},fetchMember:async()=>({id:1,audio_url:'https://media.example/01.mp3'})});
 assert.ok(story.audio_url);
});
test('amostra pública permanece disponível sem assinatura ou após expiração',async()=>{
 const sample={id:1,audio_url:null};assert.deepEqual(await loadStory(1,{member:false,fetchSample:async()=>sample}),sample);
 assert.deepEqual(await loadStory(1,{member:true,fetchSample:async()=>sample,fetchMember:async()=>{const e=new Error('expired');e.status=403;throw e;}}),sample);
 await assert.rejects(loadStory(2,{member:false,fetchMember:async()=>{const e=new Error('blocked');e.status=403;throw e;}}),/blocked/);
});
