(() => {
  const $=id=>document.getElementById(id); let password=sessionStorage.getItem('mission-admin')||'', timer=null;
  async function api(payload) {
    const response=await fetch('/api/mission',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Password':password},body:JSON.stringify(payload),cache:'no-store'});
    let data={}; try{data=await response.json()}catch(_){} if(!response.ok){const error=new Error(data.error||'서버에 연결하지 못했어요.');error.status=response.status;throw error}return data;
  }
  function loginView(){clearTimeout(timer);password='';sessionStorage.removeItem('mission-admin');$('admin-login').hidden=false;$('admin-panel').hidden=true;}
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
        row.append(who,input,button);row.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await api({action:'assign',id:p.id,team:Number(input.value)});await refresh()}catch(error){$('admin-error').textContent=error.message}finally{button.disabled=false}});roster.appendChild(row);
      }
      if(!result.participants.length && result.eventReady){const empty=document.createElement('p');empty.className='admin-empty';empty.textContent='아직 입장한 참가자가 없습니다.';roster.appendChild(empty)}
      timer=setTimeout(refresh,15000);
    } catch(error){if(error.status===401){loginView();$('login-feedback').textContent=error.message}else{$('admin-error').textContent=error.message;timer=setTimeout(refresh,15000)}}
  }
  $('login-form').addEventListener('submit',async e=>{e.preventDefault();password=$('admin-password').value;sessionStorage.setItem('mission-admin',password);$('login-feedback').textContent='확인 중입니다.';await refresh()});
  $('refresh-roster').addEventListener('click',refresh); $('logout').addEventListener('click',loginView);
  $('new-event').addEventListener('click',async()=>{if(!confirm('새 행사를 시작하면 현재 참가자와 찾기 기록은 새 행사에 표시되지 않습니다. 계속할까요?'))return;try{await api({action:'new_event'});await refresh()}catch(error){$('admin-error').textContent=error.message}});
  window.addEventListener('pagehide',()=>clearTimeout(timer));if(password)refresh();
})();
