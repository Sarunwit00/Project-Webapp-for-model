(function () {
  // ===== Config =====
  // หน้าเว็บถูกเสิร์ฟโดย backend เสมอ (ทั้งตอนรันที่ localhost:8000 และตอนเปิดผ่าน tunnel สาธารณะ)
  // -> ใช้ same-origin (path สัมพัทธ์) จะได้ทำงานทั้ง localhost และโดเมน tunnel ของคนอื่น
  // ยกเว้นเปิดผ่าน Live Server (5500) หรือเปิดไฟล์ตรง ๆ (file://) -> ชี้ไป backend ที่ localhost:8000
  const API_BASE = (location.protocol === 'file:' || location.port === '5500') ? 'http://127.0.0.1:8000' : '';
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
  const uploadedRow = document.getElementById('uploadedRow');
  const deleteUploadBtn = document.getElementById('deleteUploadBtn');
  const transcribeFileWrap = document.getElementById('transcribeFileWrap');
  const transcribeFileBtn = document.getElementById('transcribeFileBtn');

  const textOutput = document.getElementById('textOutput');
  const outputError = document.getElementById('outputError');
  const clearBtn = document.getElementById('clearBtn');

  let busy = false;
  let selectedFile = null;
  let uploadedUrl = null;

  function setStatus(msg) {
    recordStatus.textContent = msg;
  }

  function appendText(text) {
    if (!text) return;
    const cur = textOutput.value.trim();
    textOutput.value = cur ? cur + '\n' + text : text;
  }

  // แสดง/ซ่อนข้อความสีแดงเมื่อโมเดลถอดเสียงไม่ออก
  function showOutputError(msg) {
    outputError.textContent = msg;
    outputError.hidden = false;
  }

  function clearOutputError() {
    outputError.hidden = true;
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
    clearOutputError();
    setStatus('⏳ กำลังถอดเสียงด้วยโมเดล...');
    try {
      const data = await transcribe(blob);
      const text = data.text || '';
      if (text) {
        appendText(text);
        setStatus('✅ ถอดเสียงเสร็จแล้ว');
      } else if ((data.peak || 0) < 0.01) {
        showOutputError('❌ ไม่สามารถถอดข้อความได้');
        setStatus('⚠️ แทบไม่มีเสียง — เช็กไมโครโฟน/อุปกรณ์อัด หรือพูดดังขึ้น');
      } else {
        showOutputError('❌ ไม่สามารถถอดข้อความได้');
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
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    uploadedUrl = URL.createObjectURL(file);
    uploadedAudio.src = uploadedUrl;
    uploadedRow.hidden = false;
    transcribeFileWrap.hidden = false;
  }

  transcribeFileBtn.addEventListener('click', () => {
    if (selectedFile) runTranscription(selectedFile);
  });

  // ===== ลบไฟล์เสียงที่อัปโหลด =====
  deleteUploadBtn.addEventListener('click', () => {
    uploadedAudio.pause();
    if (uploadedUrl) {
      URL.revokeObjectURL(uploadedUrl);
      uploadedUrl = null;
    }
    uploadedAudio.removeAttribute('src');
    uploadedAudio.load();
    uploadedRow.hidden = true;
    transcribeFileWrap.hidden = true;
    fileName.textContent = '';
    selectedFile = null;
    fileInput.value = '';
    setStatus('ลบไฟล์เสียงแล้ว');
  });

  // ===== ล้างข้อความ =====
  clearBtn.addEventListener('click', () => {
    textOutput.value = '';
    clearOutputError();
    textOutput.focus();
  });

  // ===== เสนอคำศัพท์ใหม่ =====
  const suggestDialect = document.getElementById('suggestDialect');
  const suggestCentral = document.getElementById('suggestCentral');
  const suggestCategory = document.getElementById('suggestCategory');
  const suggestRegion = document.getElementById('suggestRegion');
  const suggestProvince = document.getElementById('suggestProvince');
  const fillFromOutputBtn = document.getElementById('fillFromOutputBtn');
  const suggestRecordBtn = document.getElementById('suggestRecordBtn');
  const suggestPickBtn = document.getElementById('suggestPickBtn');
  const suggestAudioInput = document.getElementById('suggestAudioInput');
  const suggestAudioName = document.getElementById('suggestAudioName');
  const suggestAudioClear = document.getElementById('suggestAudioClear');
  const suggestAudioPreview = document.getElementById('suggestAudioPreview');
  const suggestSubmitBtn = document.getElementById('suggestSubmitBtn');
  const suggestStatus = document.getElementById('suggestStatus');
  const suggestError = document.getElementById('suggestError');

  // จังหวัดของแต่ละภาค (เริ่มภาคละ 1 จังหวัด เพิ่มทีหลังได้)
  const PROVINCES = {
    'เหนือ': ['เชียงใหม่'],
    'อีสาน': ['ร้อยเอ็ด'],
    'ใต้': ['นครศรีธรรมราช'],
  };

  function fillProvinces() {
    const list = PROVINCES[suggestRegion.value] || [];
    suggestProvince.innerHTML = '';
    list.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      suggestProvince.appendChild(opt);
    });
  }

  function setSuggestStatus(msg) {
    suggestStatus.textContent = msg || '';
  }

  function showSuggestError(msg) {
    suggestError.textContent = msg;
    suggestError.hidden = false;
  }

  function clearSuggestError() {
    suggestError.hidden = true;
  }

  // ----- เสียงที่แนบ (อัด/อัปโหลด) -----
  let suggestAudioBlob = null;
  let suggestAudioFilename = 'sample.webm';
  let suggestAudioUrl = null;
  let suggestRecorder = null;
  let suggestChunks = [];
  let suggestStream = null;
  let suggestRecording = false;

  function setSuggestAudio(blob, displayName, filename) {
    suggestAudioBlob = blob;
    suggestAudioFilename = filename;
    if (suggestAudioUrl) URL.revokeObjectURL(suggestAudioUrl);
    suggestAudioUrl = URL.createObjectURL(blob);
    suggestAudioPreview.src = suggestAudioUrl;
    suggestAudioPreview.hidden = false;
    suggestAudioName.textContent = displayName || '';
    suggestAudioClear.hidden = false;
  }

  function clearSuggestAudio() {
    suggestAudioBlob = null;
    suggestAudioFilename = 'sample.webm';
    if (suggestAudioUrl) {
      URL.revokeObjectURL(suggestAudioUrl);
      suggestAudioUrl = null;
    }
    suggestAudioPreview.pause();
    suggestAudioPreview.removeAttribute('src');
    suggestAudioPreview.load();
    suggestAudioPreview.hidden = true;
    suggestAudioName.textContent = '';
    suggestAudioClear.hidden = true;
    suggestAudioInput.value = '';
  }

  suggestRegion.addEventListener('change', fillProvinces);
  fillProvinces();

  fillFromOutputBtn.addEventListener('click', () => {
    const t = textOutput.value.trim();
    if (!t) {
      setSuggestStatus('⚠️ ยังไม่มีข้อความที่ถอดได้');
      return;
    }
    const lines = t.split('\n').filter(Boolean);
    suggestDialect.value = lines[lines.length - 1];
    suggestDialect.focus();
    setSuggestStatus('');
  });

  suggestAudioClear.addEventListener('click', clearSuggestAudio);

  suggestPickBtn.addEventListener('click', () => suggestAudioInput.click());
  suggestAudioInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) setSuggestAudio(f, '📎 ' + f.name, f.name);
  });

  suggestRecordBtn.addEventListener('click', async () => {
    if (suggestRecording) {
      if (suggestRecorder && suggestRecorder.state !== 'inactive') suggestRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      setSuggestStatus('⚠️ เบราว์เซอร์ไม่รองรับการอัดเสียง');
      return;
    }
    try {
      suggestStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      suggestRecorder = new MediaRecorder(suggestStream);
      suggestChunks = [];
      suggestRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) suggestChunks.push(e.data);
      };
      suggestRecorder.onstop = () => {
        const mime = suggestRecorder.mimeType || 'audio/webm';
        let ext = 'webm';
        if (mime.includes('ogg')) ext = 'ogg';
        else if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = 'm4a';
        else if (mime.includes('wav')) ext = 'wav';
        const blob = new Blob(suggestChunks, { type: mime });
        if (suggestStream) suggestStream.getTracks().forEach((t) => t.stop());
        setSuggestAudio(blob, '🎙️ เสียงที่อัด', 'sample.' + ext);
        suggestRecording = false;
        suggestRecordBtn.textContent = '🎙️ อัดเสียง';
        setSuggestStatus('');
      };
      suggestRecorder.start();
      suggestRecording = true;
      suggestRecordBtn.textContent = '⏹ หยุดอัด';
      setSuggestStatus('🔴 กำลังอัด...');
    } catch (err) {
      console.error(err);
      setSuggestStatus('❌ เข้าถึงไมโครโฟนไม่ได้');
    }
  });

  suggestSubmitBtn.addEventListener('click', async () => {
    clearSuggestError();
    const dialect = suggestDialect.value.trim();
    const central = suggestCentral.value.trim();
    if (!dialect || !central) {
      showSuggestError('❌ กรุณากรอกทั้งประโยคภาษาถิ่นและคำแปลไทยกลาง');
      return;
    }
    suggestSubmitBtn.disabled = true;
    setSuggestStatus('⏳ กำลังส่ง...');
    try {
      const fd = new FormData();
      fd.append('dialect_text', dialect);
      fd.append('central_text', central);
      fd.append('category', suggestCategory.value);
      fd.append('region', suggestRegion.value);
      fd.append('province', suggestProvince.value);
      if (suggestAudioBlob) {
        fd.append('audio', suggestAudioBlob, suggestAudioFilename);
      }
      const res = await fetch(API_BASE + '/suggest', { method: 'POST', body: fd });
      if (!res.ok) {
        let msg = 'ส่งไม่สำเร็จ (' + res.status + ')';
        try {
          const j = await res.json();
          if (j && j.detail) msg = j.detail;
        } catch (e) { /* ignore */ }
        throw new Error(msg);
      }
      const data = await res.json();
      setSuggestStatus('✅ ขอบคุณ! ส่งแล้ว (รวม ' + (data.total != null ? data.total : '?') + ' ประโยค)');
      suggestDialect.value = '';
      suggestCentral.value = '';
      clearSuggestAudio();
    } catch (err) {
      console.error(err);
      if (/Failed to fetch|NetworkError|ERR_/i.test(err.message)) {
        showSuggestError('❌ ติดต่อเซิร์ฟเวอร์ไม่ได้ — เปิด backend ก่อน (รัน server/run.bat)');
      } else {
        showSuggestError('❌ ' + err.message);
      }
      setSuggestStatus('');
    } finally {
      suggestSubmitBtn.disabled = false;
    }
  });
})();
