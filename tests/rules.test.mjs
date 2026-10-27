import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDeadline,weekWIB,selectRoute,assertDistinct,splittingWindow} from '../lib/rules.mjs';
test('calendar deadlines clamp month ends and respect Jakarta week boundary',()=>{
 assert.equal(monthDeadline('2026-01-31'),'2026-02-28');
 assert.equal(monthDeadline('2028-01-31'),'2028-02-29');
 assert.equal(weekWIB(new Date('2026-10-25T18:00:00Z')),'2026-10-26');
});
test('threshold is strictly greater, urgent always routes urgent',()=>{
 assert.equal(selectRoute({amount:800000}),'REGULER');assert.equal(selectRoute({amount:800001}),'LANGSUNG');assert.equal(selectRoute({amount:10000,aggregate:850000}),'LANGSUNG');assert.equal(selectRoute({amount:10000,urgent:true}),'URGENT');
});
test('splitting window never merges purchases thirteen days apart',()=>{
 const rows=[{id:1,purchase_date:'2026-10-01',amount:500000},{id:2,purchase_date:'2026-10-13',amount:500000}];
 assert.equal(splittingWindow('2026-10-07',100000,rows).amount,600000);
 assert.equal(splittingWindow('2026-10-07',400000,[{id:1,purchase_date:'2026-10-01',amount:500000}]).amount,900000);
});
test('task separation rejects the same person regardless of their role',()=>{
 const r={proposer_id:'1',verifier_id:'2',approver_id:'3'};
 assert.throws(()=>assertDistinct(r,{id:'1'},'verify'));
 assert.throws(()=>assertDistinct(r,{id:'2'},'approve'));
 for(const id of ['1','2','3'])assert.throws(()=>assertDistinct(r,{id},'pay'));
 assert.doesNotThrow(()=>assertDistinct(r,{id:'4'},'pay'));
});
