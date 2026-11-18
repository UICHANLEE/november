(() => {
  const $=id=>document.getElementById(id); let password=sessionStorage.getItem('mission-admin')||'', timer=null, inventoryLoading=false, inventoryPending=false;
  async function api(payload) {
    const response=await fetch('/api/mission',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Password':password},body:JSON.stringify(payload),cache:'no-store'});
    let data={}; try{data=await response.json()}catch(_){} if(!response.ok){const error=new Error(data.error||'서버에 연결하지 못했어요.');error.status=response.status;throw error}return data;
  }
  function loginView(){clearTimeout(timer);password='';sessionStorage.removeItem('mission-admin');$('admin-login').hidden=false;$('admin-panel').hidden=true;$('roster').replaceChildren();$('inventory-teams').replaceChildren();$('inventory-feedback').textContent='';}
  async function refresh(){
    clearTimeout(timer);
    try {
      const result=await api({action:'roster'}); $('admin-login').hidden=true; $('admin-panel').hidden=false; $('admin-error').textContent='';
      $('roster-summary').textContent=result.eventReady ? `참가자 ${result.participants.length}명` : '시작된 행사가 없습니다. 새 행사를 시작해 주세요.';
      const roster=$('roster'); roster.replaceChildren();
      for(const p of result.participants){
        const row=document.createElement('form'); row.className='roster-row';
        const who=document.createElement('div'); const name=document.createElement('strong');name.textContent=p.name;const assigned=document.createElement('span');assigned.textContent=p.team ? `${p.team}조` : '배정 대기'; who.append(name,assigned);
        const input=document.createElement('input');input.type='number';input.min='1';input.max='999';input.step='1';input.required=true;input.value=p.team||'';input.placeholder='조 번호';input.setAttribute('aria-label',`${p.name} 참가자 조 번호`);
        const button=document.createElement('button');button.type='submit';button.textContent='배정';
        row.append(who,input,button);row.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await api({action:'assign',id:p.id,team:Number(input.value)});await refresh();await loadInventory()}catch(error){$('admin-error').textContent=error.message}finally{button.disabled=false}});roster.appendChild(row);
      }
      if(!result.participants.length && result.eventReady){const empty=document.createElement('p');empty.className='admin-empty';empty.textContent='아직 입장한 참가자가 없습니다.';roster.appendChild(empty)}
      timer=setTimeout(refresh,15000);
    } catch(error){if(error.status===401){loginView();$('login-feedback').textContent=error.message}else{$('admin-error').textContent=error.message;timer=setTimeout(refresh,15000)}}
  }
  async function addReward(team,reward) {
    const result=await api({action:'inventory_add',team,reward});
    $('inventory-feedback').textContent=result.added ? `${team}조에 ${reward} 지급을 기록했어요.` : `${team}조에 이미 기록된 재료예요.`;
    await loadInventory();
  }
  async function loadInventory() {
    if(!password) return; if(inventoryLoading){inventoryPending=true;return} inventoryLoading=true;
    try {
      const data=await api({action:'export'}); const select=$('inventory-reward'); const selected=select.value;
      select.replaceChildren(); const placeholder=document.createElement('option'); placeholder.value=''; placeholder.textContent='재료를 선택해 주세요'; select.appendChild(placeholder);
      for(const reward of data.rewardOptions){const option=document.createElement('option');option.value=reward;option.textContent=reward;select.appendChild(option)} select.value=selected;
      const container=$('inventory-teams');container.replaceChildren();
      if(!data.teams.length){const empty=document.createElement('p');empty.className='admin-empty';empty.textContent='아직 조별 기록이 없어요.';container.appendChild(empty)}
      for(const team of data.teams){
        const card=document.createElement('article');card.className='inventory-team-card';
        const heading=document.createElement('h3');heading.textContent=`${team.team}조`;card.appendChild(heading);
        const collected=document.createElement('p');collected.className='inventory-owned';
        const label=document.createElement('strong');label.textContent='지급 완료 재료';collected.appendChild(label);
        const value=document.createElement('span');value.textContent=team.inventory.length ? team.inventory.join(' · ') : '아직 지급 기록이 없어요.';collected.appendChild(value);card.appendChild(collected);
        if(team.found.length){const title=document.createElement('p');title.className='inventory-found-title';title.textContent='찾은 미션 · 완료 확인 후 지급 기록';card.appendChild(title);
          for(const mission of team.found){const row=document.createElement('div');row.className='inventory-found-row';const text=document.createElement('span');text.textContent=`${mission.id} · ${mission.reward}`;
            const button=document.createElement('button');button.type='button';button.className='admin-action';button.textContent=team.inventory.includes(mission.reward)?'기록됨':'지급 기록';button.disabled=team.inventory.includes(mission.reward);
            button.addEventListener('click',async()=>{button.disabled=true;try{await addReward(team.team,mission.reward)}catch(error){$('inventory-feedback').textContent=error.message;button.disabled=false}});row.append(text,button);card.appendChild(row)}
        }
        container.appendChild(card);
      }
    } catch(error) { $('inventory-feedback').textContent=error.message; } finally {inventoryLoading=false;if(inventoryPending){inventoryPending=false;void loadInventory()}}
  }
  $('inventory-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;try{await addReward(Number($('inventory-team').value),$('inventory-reward').value)}catch(error){$('inventory-feedback').textContent=error.message}finally{button.disabled=false}});
  $('refresh-inventory').addEventListener('click',loadInventory);
  $('login-form').addEventListener('submit',async e=>{e.preventDefault();password=$('admin-password').value;sessionStorage.setItem('mission-admin',password);$('login-feedback').textContent='확인 중입니다.';await refresh();if(password)await loadInventory()});
  async function download(kind, button) {
    button.disabled=true; $('admin-error').textContent='저장할 내용을 준비하고 있어요.';
    try {
      const data=await api({action:'export'});
      const base={event:data.event,exportedAt:data.exportedAt};
      const content=kind==='records' ? {...base,participants:data.participants,teams:data.teams} : {...base,log:data.log};
      const blob=new Blob([JSON.stringify(content,null,2)+'\n'],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url;
      link.download=`mission-${kind}-${data.exportedAt.slice(0,10)}.json`; document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      $('admin-error').textContent=kind==='records' ? '현재 기록 다운로드를 시작했어요.' : '활동 로그 다운로드를 시작했어요.';
    } catch(error){$('admin-error').textContent=error.message;} finally{button.disabled=false;}
  }
  $('save-records').addEventListener('click',event=>download('records',event.currentTarget));
  $('save-logs').addEventListener('click',event=>download('logs',event.currentTarget));
  $('refresh-roster').addEventListener('click',()=>{void refresh();void loadInventory()}); $('logout').addEventListener('click',loginView);
  $('new-event').addEventListener('click',async()=>{if(!confirm('새 행사를 시작하면 현재 기록이 새 행사에 표시되지 않습니다. 기록과 활동 로그를 저장했나요?'))return;try{await api({action:'new_event'});await refresh();await loadInventory()}catch(error){$('admin-error').textContent=error.message}});
  window.addEventListener('pagehide',()=>clearTimeout(timer));if(password){refresh().then(()=>{if(password)loadInventory()})};
})();
