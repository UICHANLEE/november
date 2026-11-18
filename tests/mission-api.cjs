const assert=require('node:assert/strict');const vm=require('node:vm');
const actualFetch=global.fetch;const values=new Map(), hashes=new Map(),sets=new Map();
process.env.KV_REST_API_URL='https://redis.invalid';process.env.KV_REST_API_TOKEN='test';process.env.MISSION_ADMIN_PASSWORD='a-long-test-admin-password';
function hash(k){if(!hashes.has(k))hashes.set(k,new Map());return hashes.get(k)}
global.fetch=async (_,options)=>{const a=JSON.parse(options.body), cmd=a[0];let result;
if(cmd==='GET')result=values.get(a[1])||null;
else if(cmd==='SET'){values.set(a[1],a[2]);result='OK'}
else if(cmd==='HSET'){hash(a[1]).set(a[2],a[3]);result=1}
else if(cmd==='HGET')result=hash(a[1]).get(a[2])||null;
else if(cmd==='HGETALL')result=[...hash(a[1])].flat();
else if(cmd==='EVAL') {const key=a[3],id=a[a[2]===2?5:4], data=hash(key).get(id); if(a[1].includes("p.team=tonumber")){if(!data)result=0;else{const p=JSON.parse(data);p.team=Number(a[5]);hash(key).set(id,JSON.stringify(p));result=1}}else if(values.get(a[4])!==a[8])result=-1002;else if(!data)result=-1;else {const p=JSON.parse(data);if(!p.team)result=-2;else {const skey=a[6]+p.team;if(!sets.has(skey))sets.set(skey,new Set());let set=sets.get(skey);result=set.has(a[7])?-p.team-2:p.team;set.add(a[7]);}}}
else throw Error(`unexpected ${cmd}`);
return {ok:true,json:async()=>({result})}}
const handler=require(process.cwd()+'/api/mission.js');const code=require(process.cwd()+'/data/codes.json')[0];
async function call(action,extra={},admin=false){let status=200,payload;const req={method:'POST',headers:admin?{'x-admin-password':'a-long-test-admin-password'}:{},body:{action,...extra}};const res={setHeader(){},status(n){status=n;return this},json(data){payload=data;return data}};await handler(req,res);return {status,body:payload}}
(async()=>{
assert.equal((await call('roster')).status,401);
assert.equal((await call('register',{name:'참가자'})).status,503);
await call('new_event',{},true);
const a=await call('register',{name:'가람'}), b=await call('register',{name:'나래'}), c=await call('register',{name:'다온'});
assert.equal((await call('claim',{token:a.body.token,code:code.value})).status,403);
let roster=(await call('roster',{},true)).body.participants;assert.equal(roster.length,3);
for(let i=0;i<3;i++)assert.equal((await call('assign',{id:roster[i].id,team:i===2?2:1},true)).status,200);
const [first,race]=await Promise.all([call('claim',{token:a.body.token,code:code.value}),call('claim',{token:b.body.token,code:code.value})]);assert.equal([first.body.duplicate,race.body.duplicate].filter(x=>x===false).length,1);assert.equal([first.body.duplicate,race.body.duplicate].filter(x=>x===true).length,1);
const other=await call('claim',{token:c.body.token,code:code.value});assert.equal(other.body.duplicate,false);assert.equal(other.body.level,code.level);
assert.equal((await call('claim',{token:a.body.token,code:'bad'})).status,400);
assert.equal((await call('cards')).status,401);assert.equal((await call('cards',{},true)).body.cards.length,15);
await call('new_event',{},true);assert.equal((await call('status',{token:a.body.token})).status,401);
console.log('API tests passed: admin access, registration, assignment, concurrent duplicate, different teams, code validation, QR access, event reset.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>global.fetch=actualFetch);
