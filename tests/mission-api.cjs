const assert=require('node:assert/strict');
const actualFetch=global.fetch;const values=new Map(), hashes=new Map(),sets=new Map(),lists=new Map();
process.env.KV_REST_API_URL='https://redis.invalid';process.env.KV_REST_API_TOKEN='test';process.env.MISSION_ADMIN_PASSWORD='a-long-test-admin-password';
function hash(k){if(!hashes.has(k))hashes.set(k,new Map());return hashes.get(k)}
function list(k){if(!lists.has(k))lists.set(k,[]);return lists.get(k)}
global.fetch=async (_,options)=>{
 const a=JSON.parse(options.body),cmd=a[0];let result;
 if(cmd==='GET')result=values.get(a[1])||null;
 else if(cmd==='HGET')result=hash(a[1]).get(a[2])||null;
 else if(cmd==='HGETALL')result=[...hash(a[1])].flat();
 else if(cmd==='LRANGE')result=list(a[1]);
 else if(cmd==='SMEMBERS')result=[...(sets.get(a[1])||[])];
 else if(cmd==='SCAN'){const match=a[3].slice(0,-1);result=['0',[...sets.keys()].filter(k=>k.startsWith(match))]}
 else if(cmd==='EVAL'){
   const script=a[1],n=Number(a[2]),keys=a.slice(3,3+n),arg=a.slice(3+n);
   if(script.includes("redis.call('SET',KEYS[1]")){values.set(keys[0],arg[0]);list(keys[1]).push(arg[1]);result=1}
   else if(values.get(keys[1])!==arg[3])result=script.includes("local person=")?-1002:script.includes('p.team=tonumber')?-1:0;
   else if(script.includes("local person=")){
     const raw=hash(keys[0]).get(arg[0]);if(!raw)result=-1;else{const p=JSON.parse(raw);if(!p.team)result=-2;else{const k=arg[1]+p.team;if(!sets.has(k))sets.set(k,new Set());const set=sets.get(k);let kind;if(set.has(arg[2])){kind='duplicate';result=-p.team-2}else if(Number(arg[6])===3 && JSON.parse(arg[7]).some(code=>set.has(code))){kind='hard_limit';result=-2000-p.team}else{set.add(arg[2]);kind='found';result=p.team}list(keys[2]).push(JSON.stringify({type:kind,at:Number(arg[4]),name:p.name,team:p.team,qrId:arg[5],level:Number(arg[6])}));}}
   }else if(script.includes('p.team=tonumber')){
     const raw=hash(keys[0]).get(arg[0]);if(!raw)result=0;else{const p=JSON.parse(raw),previousTeam=p.team;p.team=Number(arg[1]);hash(keys[0]).set(arg[0],JSON.stringify(p));list(keys[2]).push(JSON.stringify({type:'assigned',at:Number(arg[2]),name:p.name,team:p.team,previousTeam}));result=1}
   }else{
     hash(keys[0]).set(arg[0],arg[1]);list(keys[2]).push(arg[2]);result=1;
   }
 } else throw Error(`Unexpected command: ${cmd}`);
 return {ok:true,json:async()=>({result})};
};
const handler=require(process.cwd()+'/api/mission.js'),codes=require(process.cwd()+'/data/codes.json'),code=codes[0],missions=require(process.cwd()+'/data/missions.json'),crypto=require('node:crypto');
async function call(action,extra={},admin=false){let status=200,payload;const req={method:'POST',headers:admin?{'x-admin-password':'a-long-test-admin-password'}:{},body:{action,...extra}};const res={setHeader(){},status(n){status=n;return this},json(data){payload=data;return data}};await handler(req,res);return {status,body:payload}}
(async()=>{
 assert.equal((await call('export')).status,401);assert.equal((await call('export',{},true)).status,409);
 assert.equal((await call('register',{name:'참가자'})).status,503);await call('new_event',{},true);
 const a=await call('register',{name:'가람'}),b=await call('register',{name:'나래'}),c=await call('register',{name:'다온'});
 assert.equal((await call('claim',{token:a.body.token,code:code.value})).status,403);
 let roster=(await call('roster',{},true)).body.participants;assert.equal(roster.length,3);
 for(let i=0;i<3;i++)assert.equal((await call('assign',{id:roster[i].id,team:i===2?2:1},true)).status,200);
 const [first,race]=await Promise.all([call('claim',{token:a.body.token,code:code.value}),call('claim',{token:b.body.token,code:code.value})]);assert.equal([first.body.duplicate,race.body.duplicate].filter(x=>x===false).length,1);assert.equal([first.body.duplicate,race.body.duplicate].filter(x=>x===true).length,1);
 const other=await call('claim',{token:c.body.token,code:code.value});assert.equal(other.body.duplicate,false);assert.equal(other.body.level,code.level);assert.equal(other.body.mission.reward,'쌈무');
 const hard=codes.find(c=>c.id==='3-01'),hard2=codes.find(c=>c.id==='3-02');
 const h1=await call('claim',{token:a.body.token,code:hard.value});assert.equal(h1.body.mission.reward,'고기 1개');
 assert.equal((await call('claim',{token:b.body.token,code:hard.value})).body.duplicate,true);
 assert.equal((await call('claim',{token:b.body.token,code:hard2.value})).body.limit,true);
 assert.equal((await call('claim',{token:c.body.token,code:hard2.value})).body.duplicate,false);
 const usual=Object.keys(missions).filter(id=>!id.startsWith('3-')).map(id=>missions[id]);assert.equal(usual.length,10);assert.equal(new Set(usual.map(m=>m.reward)).size,10);for(const mission of Object.values(missions))assert(require('node:fs').existsSync(`dist/assets/rewards/${mission.rewardKey}.svg`));
 assert.equal((await call('claim',{token:a.body.token,code:'bad'})).status,400);
 let backup=(await call('export',{},true)).body;assert.equal(backup.participants.length,3);assert.equal(backup.teams.length,2);assert.equal(backup.teams[0].found[0].id,code.id);
 for(const kind of ['event_started','joined','assigned','found','duplicate','hard_limit'])assert(backup.log.some(e=>e.type===kind));
 assert(!JSON.stringify(backup).includes(a.body.token));assert(!JSON.stringify(backup).includes(code.value));
 const oldGroup=`mission:v1:${backup.event}:finds:9`;sets.set(oldGroup,new Set([crypto.createHash('sha256').update(code.value).digest('hex')]));
 backup=(await call('export',{},true)).body;assert(backup.teams.some(team=>team.team===9),'Exports old team records even when no one currently belongs to that team');
 const legacyKey=`mission:v1:${backup.event}:finds:8`;sets.set(legacyKey,new Set([crypto.createHash('sha256').update(hard.value).digest('hex')]));
 await call('assign',{id:roster[0].id,team:8},true);assert.equal((await call('claim',{token:a.body.token,code:hard2.value})).body.limit,true,'Old hard QR records count towards the limit');
 await call('assign',{id:roster[0].id,team:6},true);await call('assign',{id:roster[1].id,team:6},true);const simultaneous=await Promise.all([call('claim',{token:a.body.token,code:hard.value}),call('claim',{token:b.body.token,code:hard2.value})]);assert.equal(simultaneous.filter(x=>x.body.limit).length,1);assert.equal(simultaneous.filter(x=>x.body.mission?.reward==='고기 1개').length,1);
 assert.equal((await call('cards')).status,401);assert.equal((await call('cards',{},true)).body.cards.length,15);
 await call('new_event',{},true);assert.equal((await call('status',{token:a.body.token})).status,401);
 console.log('Passed: per-team duplicate, hard mission limit, different teams, unique rewards, exports, logs and event reset.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>global.fetch=actualFetch);
