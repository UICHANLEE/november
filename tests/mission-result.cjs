const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('dist/app.js','utf8');
async function scenario(result){
 const els=new Map(),requests=[];function el(id){if(!els.has(id))els.set(id,{id,hidden:false,disabled:false,textContent:'',value:'',listeners:{},classList:{add(){},remove(){}},addEventListener(type,fn){this.listeners[type]=fn},focus(){},querySelector(){return {disabled:false}}});return els.get(id)}
 Object.assign(el('video'),{readyState:2,videoWidth:10,videoHeight:10,play:async()=>{}});el('canvas').getContext=()=>({drawImage(){},getImageData(){return{data:new Uint8ClampedArray(400),width:10,height:10}}});
 const storage={getItem:()=> 'participant',setItem(){},removeItem(){}};
 const context={document:{getElementById:el},window:{jsQR:()=>({data:'test-qr'}),addEventListener(){}},localStorage:storage,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},console,fetch:async (_,options)=>{const body=JSON.parse(options.body);requests.push(body);return {ok:true,json:async()=>body.action==='status'?{name:'test',team:1}:body.action==='reveal'?{reward:'깻잎',revealLine:'마늘인 척한 깻잎!',team:1}:result}}};
 vm.runInNewContext(source,context);await new Promise(r=>setImmediate(r));await el('start').listeners.click();await new Promise(r=>setImmediate(r));return {el,requests};
}
(async()=>{
 const mission={id:'1-03',category:'일반 미션',instruction:'단체 포즈를 똑같이 해 보세요.',decoyKey:'garlic'};
 let {el,requests}=await scenario({duplicate:false,team:1,mission});assert.equal(requests.find(x=>x.action==='claim').clientVersion,2);assert.equal(el('mission-category').textContent,'일반 미션');assert.equal(el('mission-reward').textContent,'???');assert.equal(el('mission-reward-image').src,'assets/rewards/garlic.svg');assert.equal(el('result').hidden,false);
 await el('reveal-reward').listeners.click();assert.equal(el('mission-reward').textContent,'깻잎');assert.equal(el('mission-reward-image').src,'assets/reveals/1-03.svg');assert.equal(el('reward-instruction').textContent,'마늘인 척한 깻잎!');assert.equal(el('reveal-reward').hidden,true);assert.equal(requests.find(x=>x.action==='reveal').missionId,'1-03');
 ({el}=await scenario({duplicate:true,team:1,mission}));assert.equal(el('result-title').textContent,'이미 찾았어요');assert.equal(el('new-result').hidden,true);el('review-mission').listeners.click();assert.equal(el('new-result').hidden,false);assert.equal(el('mission-reward').textContent,'???');await el('reveal-reward').listeners.click();assert.equal(el('mission-reward').textContent,'깻잎');
 ({el}=await scenario({limit:true,team:1}));assert.equal(el('result-title').textContent,'어려운 미션에 이미 참여했어요');assert.equal(el('limit-result').hidden,false);assert.equal(el('new-result').hidden,true);
 console.log('Passed: hidden silhouette, reveal button, duplicate recovery and hard-limit display.');
})().catch(e=>{console.error(e);process.exitCode=1});
