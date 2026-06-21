(function() {
  // ===== Elements =====
  const recordBtn = document.getElementById('recordBtn');
  const recordLabel = document.getElementById('recordLabel');
  const recordStatus = document.getElementById('recordStatus');
  const recordedAudio = document.getElementById('recordedAudio');

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileName = document.getElementById('fileName');
  const uploadedAudio = document.getElementById('uploadedAudio');
  const uploadWarn = document.getElementById('uploadWarn');
  const transcribeFileWrap = document.getElementById('transcribeFileWrap');
  const transcribeFileBtn = document.getElementById('transcribeFileBtn');

  const textOutput = document.getElementById('textOutput');

  // ===== Speech Recognition =====
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecognizing = false;
  let finalText = '';

  if (!SR) {
    recordStatus.textContent = '⚠️ เบราว์เซอร์ไม่รองรับ (กรุณาใช้ Chrome หรือ Edge)';
    recordBtn.disabled = true;
  } else {
    recognition = new SR();
    recognition.lang = 'th-TH';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      textOutput.value = (finalText + interim).trim();
    };

    recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error);
      recordStatus.textContent = '❌ ข้อผิดพลาด: ' + e.error;
    };

    recognition.onend = () => {
      if (isRecognizing) {
        // Auto-restart for continuous recording
        try { recognition.start(); } catch (err) {}
      } else {
        recordLabel.textContent = 'เริ่มบันทึก';
        recordBtn.classList.remove('recording');
        recordStatus.textContent = 'หยุดบันทึกแล้ว';
      }
    };
  }

  // ===== MediaRecorder for saving audio =====
  let mediaRecorder = null;
  let audioChunks = [];

  async function startRecording() {
    try {
      // Sync final text from textarea (in case user edited)
      finalText = textOutput.value ? textOutput.value + ' ' : '';

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        recordedAudio.src = URL.createObjectURL(blob);
        recordedAudio.hidden = false;
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();

      isRecognizing = true;
      try { recognition.start(); } catch (err) { console.warn(err); }

      recordBtn.classList.add('recording');
      recordLabel.textContent = 'หยุดบันทึก';
      recordStatus.textContent = '🔴 กำลังบันทึก...';
    } catch (err) {
      console.error(err);
      recordStatus.textContent = '❌ ไม่สามารถเข้าถึงไมโครโฟน: ' + err.message;
    }
  }

  function stopRecording() {
    isRecognizing = false;
    if (recognition) {
      try { recognition.stop(); } catch (err) {}
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    recordBtn.classList.remove('recording');
    recordLabel.textContent = 'เริ่มบันทึก';
    recordStatus.textContent = '✅ บันทึกเสร็จสิ้น';
  }

  recordBtn.addEventListener('click', () => {
    if (recordBtn.classList.contains('recording')) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  // ===== File Upload =====
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  function handleFile(file) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(file.name)) {
      alert('กรุณาเลือกไฟล์เสียงเท่านั้น');
      return;
    }
    fileName.textContent = '📎 ' + file.name + '  (' + (file.size / 1024 / 1024).toFixed(2) + ' MB)';
    uploadedAudio.src = URL.createObjectURL(file);
    uploadedAudio.hidden = false;
    uploadWarn.hidden = false;
    transcribeFileWrap.hidden = false;
  }

  // Transcribe uploaded file: play it AND start recognition (mic captures speakers)
  transcribeFileBtn.addEventListener('click', async () => {
    if (!recognition) return;
    if (uploadedAudio.paused) {
      try {
        finalText = textOutput.value ? textOutput.value + ' ' : '';
        await navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => stream.getTracks().forEach(t => t.stop()));
        isRecognizing = true;
        try { recognition.start(); } catch (err) {}
        uploadedAudio.currentTime = 0;
        await uploadedAudio.play();
        transcribeFileBtn.textContent = '⏹️ หยุดถอดเสียง';
        recordStatus.textContent = '🎧 กำลังเล่นและถอดเสียง...';
      } catch (err) {
        recordStatus.textContent = '❌ ' + err.message;
      }
    } else {
      uploadedAudio.pause();
      isRecognizing = false;
      try { recognition.stop(); } catch (err) {}
      transcribeFileBtn.textContent = '▶️ เล่นและถอดเสียง';
      recordStatus.textContent = '✅ หยุดแล้ว';
    }
  });

  uploadedAudio.addEventListener('ended', () => {
    isRecognizing = false;
    if (recognition) try { recognition.stop(); } catch (err) {}
    transcribeFileBtn.textContent = '▶️ เล่นและถอดเสียง';
    recordStatus.textContent = '✅ เล่นจบแล้ว';
  });

})();
