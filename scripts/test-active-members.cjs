const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../frontend/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {activeMembers,activeMemberRecords}=require('../frontend/src/app/pages/active-member.model.ts');
const members=[{id:'a',active:1},{id:'b',active:0},{id:'c',active:false}],records=[{memberId:'a',days:1},{memberId:'b',days:5},{memberId:'gone',days:2}];const before=JSON.stringify({members,records});
assert.deepEqual(activeMembers(members).map(x=>x.id),['a']);assert.equal(activeMemberRecords(records,members).reduce((s,r)=>s+r.days,0),1);assert.deepEqual(activeMemberRecords(records,[]),[]);assert.equal(JSON.stringify({members,records}),before);
assert.equal(activeMemberRecords(records,members.map(m=>({...m,active:1}))).length,2);
console.log('Active-only display PASS: inactive/missing members excluded from rows/totals, reactivation restores records, source data unchanged.');
