(function () {
  // ===== Config =====
  // backend โมเดลรันที่พอร์ต 8000 เสมอ
  // - ถ้าหน้าเว็บถูกเสิร์ฟจาก 8000 อยู่แล้ว -> ใช้ path สัมพัทธ์ (same-origin)
  // - กรณีอื่น (Live Server 5500, เปิดไฟล์ file://) -> ยิงไปที่ http://127.0.0.1:8000 (CORS เปิดไว้แล้ว)
  const API_BASE = location.port === '8000' ? '' : 'http://127.0.0.1:8000';
  const TARGET_SR = 16000;

  // ===== Elements =====
  const recordBtn = document.getElementById('recordBtn');
  const recordLabel = document.getElementById('recordLabel');
  const recordStatus = document.getElementById('recordStatus');
  const recordedAudio = document.getElementById('recordedAudio');
  const recordedRow = document.getElementById('recordedRow');
  const deleteRecordingBtn = document.getElementById('deleteRecordingBtn');
  const micMeter = document.getElementById('micMeter');
  const micMeterFill = document.getElementById('micMeterFill');

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileName = document.getElementById('fileName');
  const uploadedAudio = document.getElementById('uploadedAudio');
  const transcribeFileWrap = document.getElementById('transcribeFileWrap');
  const transcribeFileBtn = document.getElementById('transcribeFileBtn');

  const textOutput = document.getElementById('textOutput');
  const clearBtn = document.getElementById('clearBtn');

  let busy = false;
  let selectedFile = null;

  function setStatus(msg) {
    recordStatus.textContent = msg;
  }

  function appendText(text) {
    if (!text) return;
    const cur = textOutput.value.trim();
    textOutput.value = cur ? cur + '\n' + text : text;
  }

  // ===== แปลงเสียง (recorded blob / uploaded file) -> WAV 16kHz mono =====
  async function blobToWav16k(blob) {
    const arrayBuf = await blob.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const tmpCtx = new AC();
    let decoded;
    try {
      decoded = await tmpCtx.decodeAudioData(arrayBuf);
    } finally {
      tmpCtx.close();
    }

    const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SR));
    // 1 ช่อง + sample rate 16000 -> Web Audio จะ downmix เป็น mono และ resample ให้เอง
    const offline = new OfflineAudioContext(1, frames, TARGET_SR);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    const ch = rendered.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
    console.log(
      '[stt] เสียงที่อ่านได้: ' + decoded.duration.toFixed(2) + 's @' + decoded.sampleRate +
      'Hz ' + decoded.numberOfChannels + 'ch -> 16k mono, peak=' + peak.toFixed(4) +
      (peak < 0.01 ? '  ⚠️ แทบเงียบ!' : '')
    );
    return encodeWav(ch, TARGET_SR);
  }

  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);   // sub-chunk size
    view.setUint16(20, 1, true);    // PCM
    view.setUint16(22, 1, true);    // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);    // block align
    view.setUint16(34, 16, true);   // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  // ===== ส่งไป backend แล้วรับข้อความกลับ =====
  async function transcribe(blob) {
    const wav = await blobToWav16k(blob);
    const fd = new FormData();
    fd.append('file', wav, 'audio.wav');
    const res = await fetch(API_BASE + '/transcribe', { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = 'เซิร์ฟเวอร์ตอบกลับผิดพลาด (' + res.status + ')';
      try {
        const j = await res.json();
        if (j && j.detail) msg = j.detail;
      } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    const data = await res.json();
    return data; // { text, seconds, peak }
  }

  async function runTranscription(blob) {
    if (busy) return;
    busy = true;
    transcribeFileBtn.disabled = true;
    setStatus('⏳ กำลังถอดเสียงด้วยโมเดล...');
    try {
      const data = await transcribe(blob);
      const text = data.text || '';
      appendText(text);
      if (text) {
        setStatus('✅ ถอดเสียงเสร็จแล้ว');
      } else if ((data.peak || 0) < 0.01) {
        setStatus('⚠️ แทบไม่มีเสียง — เช็กไมโครโฟน/อุปกรณ์อัด หรือพูดดังขึ้น');
      } else {
        setStatus('⚠️ ได้ยินเสียงแต่โมเดลถอดไม่ออก (ลองพูดชัด ๆ/ยาวขึ้น)');
      }
    } catch (err) {
      console.error(err);
      if (/Failed to fetch|NetworkError|ERR_/i.test(err.message)) {
        setStatus('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้ — เปิด backend ก่อน (รัน server/run.bat)');
      } else {
        setStatus('❌ ' + err.message);
      }
    } finally {
      busy = false;
      transcribeFileBtn.disabled = false;
    }
  }

  // ===== บันทึกเสียงด้วยไมโครโฟน =====
  let mediaRecorder = null;
  let audioChunks = [];
  let micStream = null;
  let recordedUrl = null;

  // แถบวัดระดับเสียงสด
  let meterCtx = null, meterAnalyser = null, meterData = null, meterRaf = null, meterLevel = 0;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    setStatus('⚠️ เบราว์เซอร์ไม่รองรับการบันทึกเสียง (ใช้ Chrome/Edge/Firefox)');
    recordBtn.disabled = true;
  }

  function startMeter(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      meterCtx = new AC();
      const source = meterCtx.createMediaStreamSource(stream);
      meterAnalyser = meterCtx.createAnalyser();
      meterAnalyser.fftSize = 1024;
      source.connect(meterAnalyser); // ไม่ต่อไป destination เพื่อกันเสียงหอน
      meterData = new Float32Array(meterAnalyser.fftSize);
      meterLevel = 0;
      micMeter.hidden = false;
      drawMeter();
    } catch (err) {
      console.warn('meter error', err);
    }
  }

  function drawMeter() {
    if (!meterAnalyser) return;
    meterAnalyser.getFloatTimeDomainData(meterData);
    let peak = 0;
    for (let i = 0; i < meterData.length; i++) {
      const a = Math.abs(meterData[i]);
      if (a > peak) peak = a;
    }
    const target = Math.min(1, peak * 1.4);
    // attack เร็ว / release ช้า ให้แถบดูนุ่ม
    meterLevel = target > meterLevel ? target : meterLevel + (target - meterLevel) * 0.2;
    micMeterFill.style.width = (meterLevel * 100).toFixed(1) + '%';
    micMeterFill.classList.toggle('clip', meterLevel > 0.92);
    meterRaf = requestAnimationFrame(drawMeter);
  }

  function stopMeter() {
    if (meterRaf) cancelAnimationFrame(meterRaf);
    meterRaf = null;
    meterAnalyser = null;
    meterData = null;
    if (meterCtx) {
      meterCtx.close().catch(() => {});
      meterCtx = null;
    }
    if (micMeter) {
      micMeter.hidden = true;
      micMeterFill.style.width = '0%';
      micMeterFill.classList.remove('clip');
    }
  }

  async function startRecording() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(micStream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        recordedUrl = URL.createObjectURL(blob);
        recordedAudio.src = recordedUrl;
        recordedRow.hidden = false;
        if (micStream) micStream.getTracks().forEach((t) => t.stop());
        await runTranscription(blob);
      };

      mediaRecorder.start();
      startMeter(micStream);
      recordBtn.classList.add('recording');
      recordLabel.textContent = 'หยุดบันทึก';
      setStatus('🔴 กำลังบันทึก...');
    } catch (err) {
      console.error(err);
      setStatus('❌ เข้าถึงไมโครโฟนไม่ได้: ' + err.message);
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    stopMeter();
    recordBtn.classList.remove('recording');
    recordLabel.textContent = 'เริ่มบันทึก';
    setStatus('⏳ กำลังถอดเสียงด้วยโมเดล...');
  }

  recordBtn.addEventListener('click', () => {
    if (recordBtn.classList.contains('recording')) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  // ===== ลบไฟล์เสียงที่อัด =====
  deleteRecordingBtn.addEventListener('click', () => {
    recordedAudio.pause();
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      recordedUrl = null;
    }
    recordedAudio.removeAttribute('src');
    recordedAudio.load();
    recordedRow.hidden = true;
    setStatus('ลบไฟล์เสียงที่อัดแล้ว');
  });

  // ===== อัปโหลดไฟล์ =====
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  function handleFile(file) {
    const ok = file.type.startsWith('audio/') ||
      /\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(file.name);
    if (!ok) {
      alert('กรุณาเลือกไฟล์เสียงเท่านั้น');
      return;
    }
    selectedFile = file;
    fileName.textContent = '📎 ' + file.name + '  (' + (file.size / 1024 / 1024).toFixed(2) + ' MB)';
    uploadedAudio.src = URL.createObjectURL(file);
    uploadedAudio.hidden = false;
    transcribeFileWrap.hidden = false;
  }

  transcribeFileBtn.addEventListener('click', () => {
    if (selectedFile) runTranscription(selectedFile);
  });

  // ===== ล้างข้อความ =====
  clearBtn.addEventListener('click', () => {
    textOutput.value = '';
    textOutput.focus();
  });
})();
