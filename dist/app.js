(() => {
  const $ = id => document.getElementById(id);
  const video=$('video'), canvas=$('canvas'), context=canvas.getContext('2d',{willReadFrequently:true});
  const start=$('start'), stop=$('stop'), feedback=$('feedback'), status=$('status'), camera=$('camera');
  let token=localStorage.getItem('mission-participant') || '', team=null, stream=null, frame=null, starting=false, processing=false, timer=null, polling=false, currentMission=null;
  function closeCamera() {
    if(frame) cancelAnimationFrame(frame); frame=null;
    if(stream) stream.getTracks().forEach(track=>track.stop()); stream=null; video.srcObject=null;
    camera.classList.remove('active'); start.hidden=false; stop.hidden=true; status.textContent='준비됨';
  }
  async function api(payload) {
    const response=await fetch('/api/mission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
    let body={}; try { body=await response.json(); } catch (_) {}
    if(!response.ok) { const error=new Error(body.error || '서버에 연결하지 못했어요.'); error.status=response.status; throw error; }
    return body;
  }
  function show(id) { for (const key of ['team-screen','waiting-view','scanner-view']) $(key).hidden=key!==id; }
  function schedulePoll(ms) { clearTimeout(timer); timer=setTimeout(refresh,ms); }
  async function refresh() {
    if(!token || polling) return; polling=true;
    try {
      const participant=await api({action:'status',token});
      if(participant.team) {
        const changed=team !== participant.team; team=participant.team; $('team-name').textContent=`${team}조`; $('header-team').textContent=`${team}조`;
        if (changed && stream) closeCamera();
        show('scanner-view');
      } else {
        if(stream) closeCamera(); team=null; $('header-team').textContent='배정 대기'; $('waiting-name').textContent=participant.name; $('waiting-feedback').textContent='배정 여부를 확인하고 있어요.'; show('waiting-view');
      }
      schedulePoll(participant.team ? 30000 : 10000);
    } catch(error) {
      if(error.status===401) { localStorage.removeItem('mission-participant'); token=''; team=null; closeCamera(); show('team-screen'); $('entry-feedback').textContent=error.message; }
      else { if(!team) $('waiting-feedback').textContent='연결을 확인하고 다시 시도하고 있어요.'; schedulePoll(15000); }
    } finally { polling=false; }
  }
  async function found(value) {
    processing=true; closeCamera(); status.textContent='확인 중'; feedback.textContent='우리 조의 미션 기록을 확인하고 있어요.'; start.disabled=true;
    try {
      const result=await api({action:'claim',token,code:value,clientVersion:2});
      team=result.team; $('team-name').textContent=`${team}조`; $('header-team').textContent=`${team}조`; $('result-team').textContent=`${team}조`;
      $('result-title').textContent=result.limit ? '어려운 미션에 이미 참여했어요' : result.duplicate ? '이미 찾았어요' : '미션을 찾았어요!';
      $('new-result').hidden=!!(result.duplicate || result.limit); $('duplicate-result').hidden=!result.duplicate; $('limit-result').hidden=!result.limit;
      currentMission=result.mission || null; $('review-mission').hidden=!result.duplicate || !currentMission;
      if(!result.duplicate && !result.limit) showMission(currentMission);
      $('result').hidden=false; $('result').scrollTop=0; $('result-title').focus({preventScroll:true});
    } catch(error) {
      if(error.status===400) feedback.textContent=error.message;
      else if(error.status===401 || error.status===403) { feedback.textContent=error.message; await refresh(); }
      else feedback.textContent='기록을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 스캔해 주세요.';
      status.textContent='확인 필요';
    } finally { processing=false; start.disabled=false; }
  }
  function showMission(mission) {
    $('mission-category').textContent=mission.category; $('mission-instruction').textContent=mission.instruction;
    $('mission-reward').textContent='???'; $('reward-prompt').textContent='어떤 재료일까요?'; $('reward-instruction').textContent='본부에서 미션을 완료한 뒤 확인해 주세요.'; $('mission-reward-image').alt='정체를 숨긴 재료 그림자'; $('mission-reward-image').classList.remove('is-revealed'); $('mission-reward-note').hidden=mission.category!=='어려운 미션';
    $('mission-reward-image').src=`assets/rewards/${mission.decoyKey}.svg`; $('reveal-reward').hidden=false;
    $('reveal-reward').disabled=false; $('reveal-feedback').textContent='';
  }
  $('review-mission').addEventListener('click',()=>{
    if(!currentMission) return; $('duplicate-result').hidden=true; $('limit-result').hidden=true; $('new-result').hidden=false;
    $('result-title').textContent='우리 조가 찾은 미션'; showMission(currentMission); $('reveal-reward').focus();
  });
  $('reveal-reward').addEventListener('click',async()=>{
    if(!currentMission) return; const button=$('reveal-reward'); button.disabled=true; $('reveal-feedback').textContent='재료를 확인하고 있어요.';
    try { const result=await api({action:'reveal',token,missionId:currentMission.id}); $('mission-reward').textContent=result.reward; $('reward-prompt').textContent='진짜 재료는!'; $('reward-instruction').textContent=result.revealLine || '그림자와 다른 재료였어요!'; $('mission-reward-image').src=`assets/reveals/${currentMission.id}.svg`; $('mission-reward-image').alt=`${result.reward} 그림`; $('mission-reward-image').classList.add('is-revealed'); button.hidden=true; $('reveal-feedback').textContent='본부에서 재료를 받아주세요.'; }
    catch(error) { $('reveal-feedback').textContent=error.message; }
    finally { button.disabled=false; }
  });
  function scan() {
    if(!stream || processing) return;
    if(video.readyState>=2 && video.videoWidth) {
      const scale=Math.min(1,800/video.videoWidth); canvas.width=Math.round(video.videoWidth*scale); canvas.height=Math.round(video.videoHeight*scale);
      context.drawImage(video,0,0,canvas.width,canvas.height);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      const decoded=window.jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
      if(decoded) { void found(decoded.data); return; }
    }
    frame=requestAnimationFrame(scan);
  }
  async function openCamera() {
    if(starting || stream || processing || !team) return; starting=true; start.disabled=true;
    try {
      if(!window.jsQR) throw new Error('scanner');
      if(!navigator.mediaDevices?.getUserMedia) throw new Error('secure');
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      video.srcObject=stream; await video.play(); camera.classList.add('active'); start.hidden=true; stop.hidden=false; status.textContent='스캔 중'; feedback.textContent='QR 코드를 화면 가운데에 맞춰주세요.'; scan();
    } catch(error) {
      closeCamera();
      if(error.name==='NotAllowedError' || error.name==='PermissionDeniedError') feedback.textContent='카메라 권한이 꺼져 있어요. 브라우저 설정에서 허용한 뒤 다시 시도해 주세요.';
      else if(error.name==='NotFoundError') feedback.textContent='사용할 수 있는 카메라를 찾지 못했어요.';
      else if(error.message==='secure') feedback.textContent='카메라를 사용하려면 HTTPS 주소에서 열어주세요.';
      else feedback.textContent='카메라를 시작하지 못했어요. 연결과 권한을 확인한 뒤 다시 시도해 주세요.';
    } finally { starting=false; start.disabled=false; }
  }
  $('team-form').addEventListener('submit',async event=>{
    event.preventDefault(); const button=event.currentTarget.querySelector('button[type=submit]'); button.disabled=true; $('entry-feedback').textContent='참가 정보를 등록하고 있어요.';
    try { const result=await api({action:'register',name:$('participant-name').value}); token=result.token; localStorage.setItem('mission-participant',token); await refresh(); }
    catch(error) { $('entry-feedback').textContent=error.message; }
    finally { button.disabled=false; }
  });
  function leave(){clearTimeout(timer);closeCamera();token='';team=null;$('header-team').textContent='MISSION SYSTEM';localStorage.removeItem('mission-participant');show('team-screen');$('entry-feedback').textContent='';$('participant-name').focus();}
  $('change-team').addEventListener('click',leave); $('leave-waiting').addEventListener('click',leave);
  start.addEventListener('click',openCamera); stop.addEventListener('click',()=>{closeCamera();feedback.textContent='카메라가 꺼졌어요. 다시 켜서 스캔할 수 있어요.';});
  $('again').addEventListener('click',()=>{$('result').hidden=true;status.textContent='준비됨';feedback.textContent='카메라 접근 권한을 허용해 주세요.';start.focus();});
  window.addEventListener('pagehide',()=>{clearTimeout(timer);closeCamera();});
  window.addEventListener('pageshow',()=>{if(token) refresh();});
  if(token) void refresh();
})();
