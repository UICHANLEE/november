(() => {
  const $ = (id) => document.getElementById(id);
  const video = $('video'), canvas = $('canvas'), context = canvas.getContext('2d', {willReadFrequently: true});
  const start = $('start'), stop = $('stop'), feedback = $('feedback'), status = $('status'), camera = $('camera');
  let stream = null, frame = null, codes = new Map(), starting = false;
  const ready = fetch('codes.json').then(r => { if (!r.ok) throw new Error('codes'); return r.json(); }).then(items => { codes = new Map(items.map(item => [item.value, item])); });
  function closeCamera() {
    if (frame) cancelAnimationFrame(frame); frame = null;
    if (stream) stream.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null;
    camera.classList.remove('active'); start.hidden = false; stop.hidden = true; status.textContent = '준비됨';
  }
  function scan() {
    if (!stream) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const scale = Math.min(1, 800 / video.videoWidth); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = window.jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts: 'attemptBoth'});
      if (decoded) {
        const item = codes.get(decoded.data);
        if (item) { closeCamera(); $('level').textContent = String(item.level).padStart(2,'0'); $('level-text').textContent = item.level; $('result').hidden = false; $('again').focus(); return; }
        feedback.textContent = '등록되지 않은 QR 코드예요. 미션 QR 코드를 비춰주세요.';
      }
    }
    frame = requestAnimationFrame(scan);
  }
  async function openCamera() {
    if (starting || stream) return; starting = true; start.disabled = true;
    try {
      await ready;
      if (!window.jsQR) throw new Error('scanner');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('secure');
      stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}, audio: false});
      video.srcObject = stream; await video.play();
      camera.classList.add('active'); start.hidden = true; stop.hidden = false; status.textContent = '스캔 중'; feedback.textContent = 'QR 코드를 화면 가운데에 맞춰주세요.'; scan();
    } catch (error) {
      closeCamera();
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') feedback.textContent = '카메라 권한이 꺼져 있어요. 브라우저 설정에서 허용한 뒤 다시 시도해 주세요.';
      else if (error.name === 'NotFoundError') feedback.textContent = '사용할 수 있는 카메라를 찾지 못했어요.';
      else if (error.message === 'secure') feedback.textContent = '카메라를 사용하려면 HTTPS 주소 또는 localhost에서 열어주세요.';
      else feedback.textContent = '카메라를 시작하지 못했어요. 연결과 권한을 확인한 뒤 다시 시도해 주세요.';
      console.error(error);
    } finally { starting = false; start.disabled = false; }
  }
  start.addEventListener('click', openCamera);
  stop.addEventListener('click', () => { closeCamera(); feedback.textContent = '카메라가 꺼졌어요. 다시 켜서 스캔할 수 있어요.'; });
  $('again').addEventListener('click', () => { $('result').hidden = true; feedback.textContent = '카메라 접근 권한을 허용해 주세요.'; start.focus(); });
  window.addEventListener('pagehide', closeCamera);
})();
