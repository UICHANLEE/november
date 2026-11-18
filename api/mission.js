const crypto = require('node:crypto');
const codes = require('../data/codes.json');
const missions = require('../data/missions.json');
const futureRewards = require('../data/future-rewards.json');
const rewardOptions = [...new Set([...Object.values(missions).map(m=>m.reward), ...futureRewards])];
const levels = new Map(codes.map(code => [code.value, code.level]));
const codesById = new Map(codes.map(code => [code.id,code]));
const codeMetadata = new Map(codes.map(code => [crypto.createHash('sha256').update(code.value).digest('hex'), {id:code.id, level:code.level, ...missions[code.id]}]));
const prefix = 'mission:v1:';

async function redis(...args) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('storage unavailable');
  const response = await fetch(url, {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('storage request failed');
  return data.result;
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const hardCodeHashes = JSON.stringify(codes.filter(code=>code.level===3).map(code=>digest(code.value)));
const koreaTime = value => new Date(Number(value) + 9 * 60 * 60 * 1000).toISOString().replace('Z','+09:00');
function authorized(req) {
  const expected = process.env.MISSION_ADMIN_PASSWORD;
  const supplied = req.headers['x-admin-password'];
  if (!expected || typeof supplied !== 'string' || supplied.length > 200) return false;
  return crypto.timingSafeEqual(Buffer.from(digest(expected)), Buffer.from(digest(supplied)));
}
function bad(res, code, error) { return res.status(code).json({error}); }
function validToken(token) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token); }
async function activeEvent() { return await redis('GET', prefix+'event'); }

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'POST') return bad(res,405,'지원하지 않는 요청입니다.');
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const {action} = body;
    if (['roster','assign','new_event','cards','export','inventory_add'].includes(action)) {
      if (!authorized(req)) return bad(res,401,'관리자 비밀번호가 올바르지 않습니다.');
      if(action === 'cards') return res.status(200).json({cards:require('../data/qr-cards.json').map(card=>({...card,mission:missions[card.id]})),futureRewards});
      if(action === 'new_event') {
        const event = crypto.randomBytes(12).toString('hex');
        const script = "redis.call('SET',KEYS[1],ARGV[1]); redis.call('RPUSH',KEYS[2],ARGV[2]); return 1";
        await redis('EVAL',script,2,prefix+'event',`${prefix}${event}:log`,event,JSON.stringify({type:'event_started',at:Date.now()}));
        return res.status(200).json({ok:true});
      }
      const event = await activeEvent();
      if (!event) return action === 'export' ? bad(res,409,'저장할 행사가 아직 없어요.') : res.status(200).json({participants:[],eventReady:false});
      const key = `${prefix}${event}:participants`;
      if(action === 'inventory_add') {
        if(!Number.isInteger(body.team) || body.team<1 || body.team>999 || typeof body.reward !== 'string' || !rewardOptions.includes(body.reward)) return bad(res,400,'조 번호와 재료를 확인해 주세요.');
        const script="if redis.call('GET',KEYS[2])~=ARGV[3] then return -1 end; local added=redis.call('SADD',KEYS[1],ARGV[1]); if added==1 then redis.call('RPUSH',KEYS[3],cjson.encode({type='inventory_added',at=tonumber(ARGV[2]),team=tonumber(ARGV[4]),reward=ARGV[1]})) end; return added";
        const added=await redis('EVAL',script,3,`${prefix}${event}:inventory:${body.team}`,prefix+'event',`${prefix}${event}:log`,body.reward,String(Date.now()),event,String(body.team));
        if(added===-1) return bad(res,409,'행사가 변경되었어요. 다시 시도해 주세요.');
        return res.status(200).json({added:added===1});
      }
      if(action === 'export') {
        const entries = await redis('HGETALL',key) || [];
        const participants = [];
        for(let i=0;i<entries.length;i+=2) { const p=JSON.parse(entries[i+1]); participants.push({name:p.name,team:p.team,joinedAt:koreaTime(p.joined)}); }
        participants.sort((a,b)=>a.joinedAt.localeCompare(b.joinedAt));
        const findPrefix = `${prefix}${event}:finds:`, inventoryPrefix = `${prefix}${event}:inventory:`;
        async function matchingTeams(keyPrefix) {
          let cursor='0'; const ids=new Set();
          do { const page=await redis('SCAN',cursor,'MATCH',`${keyPrefix}*`,'COUNT',100); cursor=String(page[0]);
            for(const k of page[1]) { const suffix=k.slice(keyPrefix.length); if(k.startsWith(keyPrefix) && /^\d+$/.test(suffix)) ids.add(Number(suffix)); }
          } while(cursor!=='0'); return ids;
        }
        const [foundTeams,inventoryTeams]=await Promise.all([matchingTeams(findPrefix),matchingTeams(inventoryPrefix)]);
        const teamIds=new Set([...foundTeams,...inventoryTeams,...participants.map(p=>p.team).filter(Number.isInteger)]);
        const teams=[];
        for(const team of teamIds) {
          const [found,inventory]=await Promise.all([foundTeams.has(team) ? redis('SMEMBERS',`${findPrefix}${team}`) : [],inventoryTeams.has(team) ? redis('SMEMBERS',`${inventoryPrefix}${team}`) : []]);
          teams.push({team,found:(found||[]).map(value=>codeMetadata.get(value)).filter(Boolean).sort((a,b)=>a.id.localeCompare(b.id)),inventory:(inventory||[]).sort((a,b)=>a.localeCompare(b,'ko'))});
        }
        teams.sort((a,b)=>a.team-b.team);
        const rawLog = await redis('LRANGE',`${prefix}${event}:log`,0,-1) || [];
        const log = rawLog.map(item=>{const entry=JSON.parse(item);return {...entry,at:koreaTime(entry.at)};});
        if(await activeEvent() !== event) return bad(res,409,'행사가 변경되었어요. 다시 저장해 주세요.');
        return res.status(200).json({event,exportedAt:koreaTime(Date.now()),participants,teams,log,rewardOptions});
      }
      if(action === 'roster') {
        const entries = await redis('HGETALL',key) || [];
        const participants = [];
        for(let i=0;i<entries.length;i+=2) { const p=JSON.parse(entries[i+1]); participants.push({id:entries[i],name:p.name,team:p.team,joined:p.joined}); }
        participants.sort((a,b)=>a.joined-b.joined);
        return res.status(200).json({participants,eventReady:true});
      }
      if(typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id) || !Number.isInteger(body.team) || body.team < 1 || body.team > 999) return bad(res,400,'조 번호를 확인해 주세요.');
      const script = "if redis.call('GET',KEYS[2])~=ARGV[4] then return -1 end; local v=redis.call('HGET',KEYS[1],ARGV[1]); if not v then return 0 end; local p=cjson.decode(v); local previous=p.team; p.team=tonumber(ARGV[2]); redis.call('HSET',KEYS[1],ARGV[1],cjson.encode(p)); redis.call('RPUSH',KEYS[3],cjson.encode({type='assigned',at=tonumber(ARGV[3]),name=p.name,team=p.team,previousTeam=previous})); return 1";
      const ok = await redis('EVAL',script,3,key,prefix+'event',`${prefix}${event}:log`,body.id,String(body.team),String(Date.now()),event);
      if(ok === -1) return bad(res,409,'행사가 변경되었어요. 다시 시도해 주세요.');
      return ok ? res.status(200).json({ok:true}) : bad(res,404,'참가자를 찾을 수 없습니다.');
    }
    const event = await activeEvent();
    if(!event) return bad(res,503,'아직 행사가 시작되지 않았어요. 관리자에게 문의해 주세요.');
    const participants = `${prefix}${event}:participants`;
    if(action === 'register') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if(name.length < 1 || name.length > 30 || /[\u0000-\u001f]/.test(name)) return bad(res,400,'이름은 1~30자로 입력해 주세요.');
      const token = crypto.randomBytes(32).toString('hex'), id = digest(token);
      const joined=Date.now();
      const script="if redis.call('GET',KEYS[2])~=ARGV[4] then return 0 end; redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]); redis.call('RPUSH',KEYS[3],ARGV[3]); return 1";
      const ok=await redis('EVAL',script,3,participants,prefix+'event',`${prefix}${event}:log`,id,JSON.stringify({name,team:null,joined}),JSON.stringify({type:'joined',at:joined,name}),event);
      if(!ok) return bad(res,409,'행사가 변경되었어요. 다시 입장해 주세요.');
      return res.status(200).json({token,name,team:null});
    }
    if(!validToken(body.token)) return bad(res,401,'참가 정보를 찾을 수 없어요. 다시 입장해 주세요.');
    const id = digest(body.token);
    if(action === 'status') {
      const raw = await redis('HGET',participants,id);
      if (!raw) return bad(res,401,'참가 정보가 만료되었어요. 다시 입장해 주세요.');
      const participant = JSON.parse(raw);
      return res.status(200).json({name:participant.name,team:participant.team});
    }
    if(action === 'claim') {
      if(body.clientVersion !== 2) return bad(res,400,'화면이 업데이트됐어요. 새로고침한 뒤 다시 스캔해 주세요.');
      const level = levels.get(body.code);
      if(!level) return bad(res,400,'등록되지 않은 QR 코드예요.');
      const codeId = digest(body.code);
      const script = "if redis.call('GET',KEYS[2])~=ARGV[4] then return -1002 end; local p=redis.call('HGET',KEYS[1],ARGV[1]); if not p then return -1 end; local person=cjson.decode(p); local team=person.team; if not team or team==cjson.null then return -2 end; local group=ARGV[2]..tostring(team); local kind; local outcome; if redis.call('SISMEMBER',group,ARGV[3])==1 then kind='duplicate'; outcome=-team-2 elseif tonumber(ARGV[7])==3 then for _,code in ipairs(cjson.decode(ARGV[8])) do if redis.call('SISMEMBER',group,code)==1 then kind='hard_limit'; outcome=-2000-team; break end end end; if not kind then redis.call('SADD',group,ARGV[3]); kind='found'; outcome=team end; redis.call('RPUSH',KEYS[3],cjson.encode({type=kind,at=tonumber(ARGV[5]),name=person.name,team=team,qrId=ARGV[6],level=tonumber(ARGV[7])})); return outcome";
      const codeInfo=codeMetadata.get(codeId);
      const outcome = await redis('EVAL',script,3,participants,prefix+'event',`${prefix}${event}:log`,id,`${prefix}${event}:finds:`,codeId,event,String(Date.now()),codeInfo.id,String(level),hardCodeHashes);
      if(outcome===-1002 || outcome===-1) return bad(res,401,'참가 정보가 만료되었어요. 다시 입장해 주세요.');
      if(outcome===-2) return bad(res,403,'아직 조가 배정되지 않았어요.');
      if(outcome<=-2001 && outcome>=-2999) return res.status(200).json({limit:true,team:-outcome-2000});
      const mission={id:codeInfo.id,category:codeInfo.category,instruction:codeInfo.instruction,decoyKey:codeInfo.decoyKey};
      return res.status(200).json(outcome < -2 ? {duplicate:true,team:-outcome-2,mission} : {duplicate:false,level,team:outcome,mission});
    }
    if(action === 'reveal') {
      const code = typeof body.missionId === 'string' ? codesById.get(body.missionId) : null;
      if(!code) return bad(res,400,'미션을 찾을 수 없어요.');
      const codeId=digest(code.value), codeInfo=codeMetadata.get(codeId);
      const script="if redis.call('GET',KEYS[2])~=ARGV[4] then return -1002 end; local p=redis.call('HGET',KEYS[1],ARGV[1]); if not p then return -1 end; local person=cjson.decode(p); local team=person.team; if not team or team==cjson.null then return -2 end; local finds=ARGV[2]..tostring(team); if redis.call('SISMEMBER',finds,ARGV[3])==0 then return -3 end; local revealed=ARGV[7]..tostring(team); if redis.call('SADD',revealed,ARGV[3])==1 then redis.call('RPUSH',KEYS[3],cjson.encode({type='reward_revealed',at=tonumber(ARGV[5]),name=person.name,team=team,qrId=ARGV[6]})) end; return team";
      const outcome=await redis('EVAL',script,3,participants,prefix+'event',`${prefix}${event}:log`,id,`${prefix}${event}:finds:`,codeId,event,String(Date.now()),codeInfo.id,`${prefix}${event}:reveals:`);
      if(outcome===-1002 || outcome===-1) return bad(res,401,'참가 정보가 만료되었어요. 다시 입장해 주세요.');
      if(outcome===-2) return bad(res,403,'아직 조가 배정되지 않았어요.');
      if(outcome===-3) return bad(res,403,'우리 조가 찾은 미션만 확인할 수 있어요.');
      return res.status(200).json({reward:codeInfo.reward,team:outcome});
    }
    return bad(res,400,'요청을 확인해 주세요.');
  } catch(error) { console.error('mission API error',error.message); return bad(res,503,'기록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
};
