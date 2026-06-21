"""ทดสอบว่าโมเดลโหลดได้และ inference ทำงาน (ไม่ต้องเปิดเซิร์ฟเวอร์)"""
import os
import time
from pathlib import Path

import numpy as np
import torch
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path(__file__).resolve().parents[3] / "Model"))
print("โหลดโมเดลจาก:", MODEL_DIR)

t0 = time.time()
processor = Wav2Vec2Processor.from_pretrained(str(MODEL_DIR))
model = Wav2Vec2ForCTC.from_pretrained(str(MODEL_DIR))
model.eval()
n_params = sum(p.numel() for p in model.parameters()) / 1e6
print(f"โหลดสำเร็จใน {time.time() - t0:.1f}s | พารามิเตอร์ ~{n_params:.0f}M | vocab={model.config.vocab_size}")

# เสียงสังเคราะห์ 1 วินาที (noise เบา ๆ) แค่เพื่อเช็กว่า pipeline ไม่ error
sr = 16000
audio = (0.01 * np.random.randn(sr)).astype(np.float32)

t0 = time.time()
with torch.no_grad():
    inputs = processor(audio, sampling_rate=sr, return_tensors="pt")
    logits = model(inputs.input_values).logits
    ids = torch.argmax(logits, dim=-1)
    text = processor.batch_decode(ids)[0]
print(f"inference {time.time() - t0:.2f}s | logits shape={tuple(logits.shape)}")
print("ผลถอด (เป็น noise จึงควรว่าง/มั่ว):", repr(text))
print("=> OK: โมเดลและ pipeline ทำงานได้")
