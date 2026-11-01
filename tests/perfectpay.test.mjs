import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticatePostback,parsePerfectPayEvent,perfectPayWebhook,perfectPayCheckout,CHECKOUTS} from '../server/perfectpay.mjs';
const payload={token:'secret-123',code:'SALE00001',sale_status_enum:2,plan:{code:'PPU38CQHE7N'},customer:{email:' Test@Example.com '},date_approved:'2026-10-31 18:00:00'};
test('token is required and checked',()=>{assert.throws(()=>authenticatePostback({...payload,token:'wrong'},'secret-123'));assert.doesNotThrow(()=>authenticatePostback(payload,'secret-123'));});
test('only approved/completed activate',()=>{assert.equal(parsePerfectPayEvent(payload).kind,'paid');assert.equal(parsePerfectPayEvent({...payload,sale_status_enum:8}).kind,'ignored');assert.equal(parsePerfectPayEvent({...payload,sale_status_enum:7,date_created:'2026-11-01 12:00:00'}).kind,'reversed');assert.equal(parsePerfectPayEvent({...payload,sale_status_enum:6}).kind,'ignored');});
test('unknown plan rejected',()=>assert.throws(()=>parsePerfectPayEvent({...payload,plan:{code:'other'}})));
test('webhook never provisions an unknown user',async()=>{await assert.rejects(perfectPayWebhook(payload,{config:{perfectPayToken:'secret-123'},repo:{findVerifiedUserByEmail:async()=>null}}),{code:'ACCOUNT_NOT_FOUND'});});
test('verified user maps to database transaction',async()=>{let called;const result=await perfectPayWebhook(payload,{config:{perfectPayToken:'secret-123'},repo:{findVerifiedUserByEmail:async email=>{assert.equal(email,'test@example.com');return 'user-1';},applyPerfectPayEvent:async(...args)=>{called=args;return {updated:true};}}});assert.equal(called[0],'user-1');assert.equal(result.updated,true);});
test('checkout requires confirmed email and uses exact URLs',async()=>{await assert.rejects(perfectPayCheckout({email:'a@b.com'},'monthly',{repo:{}}),{code:'EMAIL_NOT_VERIFIED'});assert.deepEqual(await perfectPayCheckout({id:'1',email:'a@b.com',email_confirmed_at:'2026-01-01'},'annual',{repo:{getSubscription:async()=>null}}),{url:CHECKOUTS.annual});});

test('invalid email types fail closed',()=>assert.throws(()=>parsePerfectPayEvent({...payload,customer:{email:42}})));
test('reversal uses event timestamp, not approval timestamp',()=>{const e=parsePerfectPayEvent({...payload,sale_status_enum:7,date_created:'2026-11-02 12:00:00'});assert.equal(e.at,'2026-11-02T15:00:00.000Z');});
