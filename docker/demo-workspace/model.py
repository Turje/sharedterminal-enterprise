#!/usr/bin/env python3
"""
ML Inference Service — Incident Sandbox
A simplified model inference pipeline that hits an OOM-style error
under specific conditions, simulating a real production ML failure.
"""
import sys
import time
import os
import json

# ── Config ──────────────────────────────────────────
MODEL_NAME = "sentiment-v2.3"
MAX_BATCH_SIZE = 64
# BUG: This multiplier is way too high for the available memory
TENSOR_BUFFER_MULTIPLIER = 512

# Load "credentials" from environment (DLP should catch these)
API_KEY = os.environ.get("API_MASTER_KEY", "mk_prod_8f14e45fceea167a5a36dedd11a")

def log(level, msg):
    colors = {"info": "\033[36m", "warn": "\033[33m", "error": "\033[31m", "ok": "\033[32m"}
    reset = "\033[0m"
    ts = time.strftime("%Y-%m-%dT%H:%M:%S")
    c = colors.get(level, "")
    print(f"\033[2m{ts}\033[0m {c}[{level.upper()}]{reset} {msg}")

def load_model():
    log("info", f"Loading model '{MODEL_NAME}'...")
    time.sleep(0.5)
    log("info", f"  Weights: 124M parameters")
    time.sleep(0.3)
    log("info", f"  Tokenizer: BPE (vocab_size=32000)")
    time.sleep(0.2)
    log("ok", f"Model '{MODEL_NAME}' loaded successfully")
    return {"name": MODEL_NAME, "params": "124M", "loaded": True}

def run_inference(model, text, batch_num):
    """Simulate inference — crashes on batch 3 due to buffer overflow."""
    log("info", f"Batch {batch_num}: tokenizing {len(text)} chars...")
    time.sleep(0.3)

    # Simulated tensor allocation
    alloc_mb = len(text) * TENSOR_BUFFER_MULTIPLIER * batch_num / 1024
    log("info", f"Batch {batch_num}: allocating {alloc_mb:.0f}MB tensor buffer")
    time.sleep(0.2)

    if alloc_mb > 100:
        log("error", f"TENSOR_OOM: Cannot allocate {alloc_mb:.0f}MB — exceeds 100MB limit")
        log("error", f"  Buffer multiplier: {TENSOR_BUFFER_MULTIPLIER} (check TENSOR_BUFFER_MULTIPLIER)")
        log("error", f"  Recommended max: 64")
        log("error", f"[FATAL] Inference pipeline crashed — out of memory")
        raise MemoryError(f"TENSOR_OOM: tried to allocate {alloc_mb:.0f}MB with multiplier={TENSOR_BUFFER_MULTIPLIER}")

    # Success
    sentiment = "positive" if batch_num % 2 == 0 else "negative"
    confidence = 0.92 - (batch_num * 0.05)
    result = {"sentiment": sentiment, "confidence": round(confidence, 3), "batch": batch_num}
    log("ok", f"Batch {batch_num}: {json.dumps(result)}")
    return result

def main():
    print("\033[36m" + "=" * 44 + "\033[0m")
    print("\033[1m  ML Inference Engine — Sentiment v2.3\033[0m")
    print("\033[36m" + "=" * 44 + "\033[0m")
    log("info", f"Authenticating with API_KEY={API_KEY}")
    time.sleep(0.3)

    model = load_model()

    test_inputs = [
        "The product quality exceeded my expectations",
        "Customer support was responsive and helpful",
        "This is the worst experience I have ever had with any service in my entire life and I want a full refund immediately",
    ]

    log("info", f"Running {len(test_inputs)} inference batches (max_batch={MAX_BATCH_SIZE})")
    print()

    results = []
    for i, text in enumerate(test_inputs, 1):
        try:
            result = run_inference(model, text, i)
            results.append(result)
        except MemoryError as e:
            print()
            log("error", "=" * 44)
            log("error", "INFERENCE PIPELINE FAILED")
            log("error", f"  Error: {e}")
            log("error", f"  Fix: Set TENSOR_BUFFER_MULTIPLIER = 64 in model.py")
            log("error", "=" * 44)
            sys.exit(1)

    # This won't execute because batch 3 always crashes
    log("ok", f"All {len(results)} batches completed successfully")

if __name__ == "__main__":
    main()
