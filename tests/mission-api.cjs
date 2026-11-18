const assert=require('node:assert/strict');
const actualFetch=global.fetch;const values=new Map(),hashes=new Map(),sets=new Map(),lists=new Map();
process.env.KV_REST_API_URL='https://redis.invalid';process.env.KV_REST_API_TOKEN='test';process.env.MISSION_ADMIN_PASSWORD='a-long-test-admin-password';
function hash(k){if(!hashes.has(k))hashes.set(k,new Map());return hashes.get(k)}
function set(k){if(!sets.has(k))sets.set(k,new Set());return sets.get(k)}
function list(k){if(!lists.has(k))lists.set(k,[]);return lists.get(k)}
global.fetch=async (_,options)=>{
 const a=JSON.parse(options.body),cmd=a[0];let result;
 if(cmd==='GET')result=values.get(a[1])||null;
 else if(cmd==='HGET')result=hash(a[1]).get(a[2])||null;
 else if(cmd==='HGETALL')result=[...hash(a[1])].flat();
 else if(cmd==='LRANGE')result=list(a[1]);
 else if(cmd==='SMEMBERS')result=[...set(a[1])];
 else if(cmd==='SCAN'){const match=a[3].slice(0,-1);result=['0',[...sets.keys()].filter(k=>k.startsWith(match))]}
 else if(cmd==='EVAL'){
   const script=a[1],n=Number(a[2]),keys=a.slice(3,3+n),arg=a.slice(3+n);
   if(script.includes("redis.call('SET',KEYS[1]")){values.set(keys[0],arg[0]);list(keys[1]).push(arg[1]);result=1}
   else if(script.includes("local added=redis.call('SADD',KEYS[1]")){
     if(values.get(keys[1])!==arg[2])result=-1;else{const items=set(keys[0]);result=items.has(arg[0])?0:1;items.add(arg[0]);if(result)list(keys[2]).push(JSON.stringify({type:'inventory_added',at:Number(arg[1]),team:Number(arg[3]),reward:arg[0]}))}
   }else if(values.get(keys[1])!==arg[3])result=script.includes('local person=')?-1002:script.includes('p.team=tonumber')?-1:0;
   else if(script.includes('local finds=')){
     const raw=hash(keys[0]).get(arg[0]);if(!raw)result=-1;else{const p=JSON.parse(raw);if(!p.team)result=-2;else if(!set(arg[1]+p.team).has(arg[2]))result=-3;else{const seen=set(arg[6]+p.team),first=!seen.has(arg[2]);seen.add(arg[2]);if(first)list(keys[2]).push(JSON.stringify({type:'reward_revealed',at:Number(arg[4]),name:p.name,team:p.team,qrId:arg[5]}));result=p.team}}
   }else if(script.includes('local person=')){
     const raw=hash(keys[0]).get(arg[0]);if(!raw)result=-1;else{const p=JSON.parse(raw);if(!p.team)result=-2;else{const group=set(arg[1]+p.team);let kind;if(group.has(arg[2])){kind='duplicate';result=-p.team-2}else if(Number(arg[6])===3 && JSON.parse(arg[7]).some(code=>group.has(code))){kind='hard_limit';result=-2000-p.team}else{group.add(arg[2]);kind='found';result=p.team}list(keys[2]).push(JSON.stringify({type:kind,at:Number(arg[4]),name:p.name,team:p.team,qrId:arg[5],level:Number(arg[6])}));}}
   }else if(script.includes('p.team=tonumber')){
     const raw=hash(keys[0]).get(arg[0]);if(!raw)result=0;else{const p=JSON.parse(raw),previousTeam=p.team;p.team=Number(arg[1]);hash(keys[0]).set(arg[0],JSON.stringify(p));list(keys[2]).push(JSON.stringify({type:'assigned',at:Number(arg[2]),name:p.name,team:p.team,previousTeam}));result=1}
   }else{hash(keys[0]).set(arg[0],arg[1]);list(keys[2]).push(arg[2]);result=1;}
 } else throw Error(`Unexpected command: ${cmd}`);
 return {ok:true,json:async()=>({result})};
};
const handler=require(process.cwd()+'/api/mission.js'),codes=require(process.cwd()+'/data/codes.json'),missions=require(process.cwd()+'/data/missions.json'),crypto=require('node:crypto');
async function call(action,extra={},admin=false){let status=200,payload;if(action==='claim' && extra.clientVersion===undefined)extra={...extra,clientVersion:2};const req={method:'POST',headers:admin?{'x-admin-password':'a-long-test-admin-password'}:{},body:{action,...extra}};const res={setHeader(){},status(n){status=n;return this},json(data){payload=data;return data}};await handler(req,res);return {status,body:payload}}
(async()=>{
 assert.equal((await call('export')).status,401);assert.equal((await call('export',{},true)).status,409);assert.equal((await call('register',{name:'참가자'})).status,503);await call('new_event',{},true);
 const a=await call('register',{name:'가람'}),b=await call('register',{name:'나래'}),c=await call('register',{name:'다온'});const normal=codes.find(c=>c.id==='1-03'),otherNormal=codes.find(c=>c.id==='1-05'),hard=codes.find(c=>c.id==='3-01'),hard2=codes.find(c=>c.id==='3-02');
 assert.equal((await call('claim',{token:a.body.token,code:normal.value})).status,403);let roster=(await call('roster',{},true)).body.participants;assert.equal(roster.length,3);
 for(let i=0;i<3;i++)assert.equal((await call('assign',{id:roster[i].id,team:i===2?2:1},true)).status,200);
 assert.equal((await call('reveal',{token:a.body.token,missionId:normal.id})).status,403);assert.equal((await call('claim',{token:a.body.token,code:normal.value,clientVersion:1})).status,400);
 const [first,race]=await Promise.all([call('claim',{token:a.body.token,code:normal.value}),call('claim',{token:b.body.token,code:normal.value})]);assert.equal([first.body.duplicate,race.body.duplicate].filter(Boolean).length,1);
 const found=[first.body,race.body].find(x=>!x.duplicate);assert.equal(found.mission.decoyKey,'garlic');assert.equal(found.mission.reward,undefined);assert.equal(found.mission.rewardKey,undefined);assert.equal(found.mission.revealLine,undefined);
 const reveal=await call('reveal',{token:a.body.token,missionId:normal.id});assert.equal(reveal.body.reward,'깻잎');assert.equal(reveal.body.revealLine,'마늘인 척한 깻잎!');assert.equal((await call('reveal',{token:b.body.token,missionId:normal.id})).body.reward,'깻잎');
 const other=await call('claim',{token:c.body.token,code:otherNormal.value});assert.equal(other.body.mission.decoyKey,'perilla');assert.equal((await call('reveal',{token:c.body.token,missionId:otherNormal.id})).body.reward,'마늘');
 assert.equal((await call('reveal',{token:c.body.token,missionId:normal.id})).status,403,'Different team cannot reveal before its own scan');assert.equal((await call('claim',{token:c.body.token,code:normal.value})).body.duplicate,false);
 const h1=await call('claim',{token:a.body.token,code:hard.value});assert.equal(h1.body.mission.reward,undefined);assert.equal((await call('reveal',{token:a.body.token,missionId:hard.id})).body.reward,'고기 1개');
 assert.equal((await call('claim',{token:b.body.token,code:hard.value})).body.duplicate,true);assert.equal((await call('claim',{token:b.body.token,code:hard2.value})).body.limit,true);assert.equal((await call('claim',{token:c.body.token,code:hard2.value})).body.duplicate,false);
 assert.equal((await call('inventory_add',{team:1,reward:'깻잎'})).status,401);assert.equal((await call('inventory_add',{team:1,reward:'무효 재료'},true)).status,400);
 const additions=await Promise.all([call('inventory_add',{team:1,reward:'깻잎'},true),call('inventory_add',{team:1,reward:'깻잎'},true)]);assert.equal(additions.filter(x=>x.body.added).length,1);
 assert.equal((await call('inventory_add',{team:1,reward:'고기 1개'},true)).body.added,true);assert.equal((await call('inventory_add',{team:1,reward:'고기 1개'},true)).body.added,false);assert.equal((await call('inventory_add',{team:9,reward:'숟가락'},true)).body.added,true);
 let backup=(await call('export',{},true)).body;assert.equal(backup.participants.length,3);assert(backup.teams.find(t=>t.team===1).inventory.includes('깻잎'));assert.deepEqual(backup.teams.find(t=>t.team===9).inventory,['숟가락']);assert(backup.rewardOptions.includes('가스버너'));
 for(const kind of ['event_started','joined','assigned','found','duplicate','hard_limit','reward_revealed','inventory_added'])assert(backup.log.some(e=>e.type===kind));assert.equal(backup.log.filter(e=>e.type==='reward_revealed'&&e.qrId===normal.id&&e.team===1).length,1);assert(!JSON.stringify(backup).includes(a.body.token));assert(!JSON.stringify(backup).includes(normal.value));
 const legacy=`mission:v1:${backup.event}:finds:8`;sets.set(legacy,new Set([crypto.createHash('sha256').update(hard.value).digest('hex')]));await call('assign',{id:roster[0].id,team:8},true);assert.equal((await call('claim',{token:a.body.token,code:hard2.value})).body.limit,true);assert.equal((await call('reveal',{token:a.body.token,missionId:hard.id})).body.reward,'고기 1개');
 await call('assign',{id:roster[0].id,team:6},true);await call('assign',{id:roster[1].id,team:6},true);const simultaneous=await Promise.all([call('claim',{token:a.body.token,code:hard.value}),call('claim',{token:b.body.token,code:hard2.value})]);assert.equal(simultaneous.filter(x=>x.body.limit).length,1);assert.equal(simultaneous.filter(x=>x.body.mission?.category==='어려운 미션').length,1);
 const usual=Object.values(missions).filter(m=>m.category==='일반 미션');assert.equal(usual.length,10);assert.equal(new Set(usual.map(m=>m.reward)).size,10);for(const mission of Object.values(missions)){assert.notEqual(mission.decoyKey,mission.rewardKey);assert(require('node:fs').existsSync(`dist/assets/rewards/${mission.decoyKey}.svg`))}
 assert.equal((await call('cards')).status,401);assert.equal((await call('cards',{},true)).body.cards.length,15);await call('new_event',{},true);assert.equal((await call('status',{token:a.body.token})).status,401);
 console.log('Passed: hidden and repeatable reveal, team isolation, limits, duplicate-safe inventory, exports, logs and existing scans.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>global.fetch=actualFetch);
