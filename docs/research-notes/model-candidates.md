# Small LLM / VLM candidates for an in-browser menu-creator agent (as of Oct 2026)

Method note: release dates, sizes and repo IDs below were checked against Hugging Face model cards and against the Hugging Face API file listings (`https://huggingface.co/api/models/<repo>/tree/main`), queried on 2026-10-04. "q4f16 total" means the sum of all `onnx/*_q4f16.onnx(_data)` files in the repo. That sum includes optional audio and vision encoders, so a text-only or image-only app downloads somewhat less. The WebLLM figures are the `vram_required_MB` values in `prebuiltAppConfig`. They are runtime VRAM estimates, not download sizes.

## Q1. Candidate table: parameters, vision, context, quantized size, RAM

### Takeaway
As of Oct 2026 the strongest in-browser vision candidates are three families: **Qwen3.5 small (0.8B/2B/4B, Mar 2026, Apache-2.0, natively multimodal)**, **Gemma 4 E2B/E4B (Apr 2026, Apache-2.0, image+audio)** and **LiquidAI LFM2.5-VL (450M/1.6B/3B, plus a JSON "Extract" fine-tune)**. Each has ready-made ONNX builds for transformers.js and LiteRT-LM files. With a q4 ONNX build, Qwen3.5-2B (~1.6 GB) and LFM2.5-VL-1.6B (~1.5 GB) are the realistic sweet spot for tablets. Gemma 4 E4B (~5.2 GB q4f16 ONNX) and the Qwen3.5-4B / Qwen2.5-VL-3B tier (~2.5–3.3 GB) are heavy for phones.

### Cited Findings

**Summary table** (web-ready sizes come from HF repo file listings; benchmark sources are in the bullets below)

| Model (release) | Params | Vision | Context | Web-ready builds (exact IDs) & size | License |
|---|---|---|---|---|---|
| Qwen3.5-0.8B (2 Mar 2026) | 0.8B | Yes (native, image+video) | 262K | `onnx-community/Qwen3.5-0.8B-ONNX` q4f16 0.65 GB / q4 0.72 GB; WebLLM `Qwen3.5-0.8B-q4f16_1-MLC` (1,629 MB VRAM); `litert-community/Qwen3.5-0.8B` `Qwen3.5-0.8B-VL_int8.litertlm` 1,302 MB | Apache-2.0 |
| Qwen3.5-2B (2 Mar 2026) | 2B | Yes | 262K | `onnx-community/Qwen3.5-2B-ONNX` q4f16 1.58 GB / q4 1.75 GB; also `-ONNX-OPT` variant (22 Apr 2026); WebLLM `Qwen3.5-2B-q4f16_1-MLC` (2,245 MB VRAM); `litert-community/Qwen3.5-2B` `Qwen3.5-2B-VL_int8.litertlm` 3,149 MB / text-only 2,117 MB | Apache-2.0 |
| Qwen3.5-4B (2 Mar 2026) | 4B | Yes | 262K | `onnx-community/Qwen3.5-4B-ONNX` q4f16 3.00 GB / q4 3.33 GB; WebLLM `Qwen3.5-4B-q4f16_1-MLC` (3,868 MB VRAM); `litert-community/Qwen3.5-4B` | Apache-2.0 |
| Gemma 4 E2B (2 Apr 2026) | 2.3B effective / 5.1B with embeddings | Yes (image + audio + video) | 128K | `onnx-community/gemma-4-E2B-it-ONNX` q4f16 ~3.38 GB total (embed 1.59 GB + decoder 1.52 GB + vision 99 MB + audio 171 MB); `onnx-community/gemma-4-E2B-it-qat-mobile-ONNX` (5 Jun 2026; q2f16 decoder 995 MB + embed 1,297 MB + fp16 vision 187 MB + audio 92 MB ≈ 2.57 GB); LiteRT-LM `litert-community/gemma-4-E2B-it-litert-lm` → `gemma-4-E2B-it-web.litertlm` 2,008 MB (text-only on web), `gemma-4-E2B-it-web.task` 2,004 MB | Apache-2.0 |
| Gemma 4 E4B (2 Apr 2026) | 4.5B effective | Yes (image + audio) | 128K | `onnx-community/gemma-4-E4B-it-ONNX` q4f16 5.18 GB / q4 5.92 GB; `onnx-community/gemma-4-E4B-it-qat-mobile-ONNX`; LiteRT-LM `gemma-4-E4B-it-web.litertlm` 2,969 MB, `.task` 2,964 MB | Apache-2.0 |
| Gemma 3n E2B (Jun 2025) | E2B | Yes | — | `onnx-community/gemma-3n-E2B-it-ONNX` q4f16 3.31 GB; GGUF `unsloth/gemma-3n-E2B-it-GGUF` | Gemma Terms (`license: gemma`) |
| LFM2.5-VL-1.6B (28 Nov 2025 per card) | 1.6B (1.2B LM + 400M SigLIP2 vision) | Yes, native 512×512 with tiling, multi-image | 32,768 | `LiquidAI/LFM2.5-VL-1.6B-ONNX` q4 1.49 GB / fp16 3.48 GB; GGUF `LiquidAI/LFM2.5-VL-1.6B-GGUF` Q4_0 696 MB + mmproj Q8_0 583 MB; `litert-community/LFM2.5-VL-1.6B` int4 `.litertlm` 1,298 MB | LFM Open License v1.0 |
| LFM2.5-VL-1.6B-**Extract** (repo 26 May 2026) | 1.6B | Yes, image→JSON | 32K (base) | GGUF `LiquidAI/LFM2.5-VL-1.6B-Extract-GGUF` Q4_K_M 731 MB + mmproj Q8_0 583 MB; also `LiquidAI/LFM2.5-VL-450M-Extract-GGUF`. No ONNX build found | LFM Open License v1.0 |
| LFM2.5-VL-450M | 450M | Yes | — | `onnx-community/LFM2.5-VL-450M-ONNX` q4f16 0.32 GB; `litert-community/LFM2.5-VL-450M` | LFM Open License |
| LFM2.5-VL-3B (repo 11 Aug 2026) | 3B | Yes | — | `LiquidAI/LFM2.5-VL-3B-ONNX` q4 2.87 GB; `LiquidAI/LFM2.5-VL-3B-GGUF`; `litert-community/LFM2.5-VL-3B` | LFM Open License |
| Qwen3-VL-2B-Instruct (Oct 2025) | 2B | Yes; OCR in 32 languages | 256K (expandable to 1M) | `onnx-community/Qwen3-VL-2B-Instruct-ONNX` q4f16 1.37 GB / q4 1.52 GB | Apache-2.0 |
| Qwen3-VL-4B-Instruct (15 Oct 2025) | 4B | Yes | 256K | `onnx-community/Qwen3-VL-4B-Instruct-ONNX`. **ORT-GenAI layout** (`onnxruntime/cpu_and_mobile/cpu-int4-rtn-block-32/`: text 2.5 GB + vision 184 MB + embedding 207 MB), not the transformers.js `onnx/` layout | Apache-2.0 |
| Qwen2.5-VL-3B-Instruct (2025) | 3B | Yes | — | `onnx-community/Qwen2.5-VL-3B-Instruct-ONNX` (28 Feb 2026) q4f16 2.55 GB | Qwen Research License (non-Apache) — see Q3 gaps |
| SmolVLM2 (Feb 2025) 256M/500M/2.2B | 0.26–2.2B | Yes | — | GGUF `ggml-org/SmolVLM2-500M-Video-Instruct-GGUF`, `ggml-org/SmolVLM2-2.2B-Instruct-GGUF`; LiteRT `litert-community/SmolVLM2-500M` 361 MB, `litert-community/SmolVLM2-2.2B`; no onnx-community repo found by name search | Apache-2.0 |
| Phi-3.5-vision (2024) | 4.2B | Yes | 4K in WebLLM | WebLLM `Phi-3.5-vision-instruct-q4f16_1-MLC` (3,952 MB VRAM). The **only VLM in WebLLM's prebuilt list** | MIT |
| Phi-4-mini-instruct (Feb 2025) | 3.8B | No | 4K in WebLLM | WebLLM `Phi-4-mini-instruct-q4f16_1-MLC` (3,438 MB VRAM); `onnx-community/Phi-4-mini-instruct-web-q4f16` 3.41 GB | MIT |
| Phi-4-multimodal-instruct (24 Feb 2025) | ~5.6B | Yes + audio | — | No web-ready build found (only community GGUF `ShayanCyan/phi4-multimodal-quantisized-gguf`) | MIT |
| Llama 3.2 1B/3B (Sep 2024) | 1.2B/3.2B | No | 4K in WebLLM | WebLLM `Llama-3.2-1B-Instruct-q4f16_1-MLC` (879 MB), `Llama-3.2-3B-Instruct-q4f16_1-MLC` (2,264 MB); `litert-community/Llama-3.2-1B`, `-3B` | Llama 3.2 Community License |
| Qwen3 0.6B/1.7B/4B (Apr–May 2025) | — | No | 4K in WebLLM | WebLLM `Qwen3-1.7B-q4f16_1-MLC` (2,037 MB), `Qwen3-4B-q4f16_1-MLC` (3,432 MB) | Apache-2.0 |
| Florence-2 base/large-ft (Jun 2024) | 0.23B / 0.77B | OCR/caption only, not chat | — | `onnx-community/Florence-2-base-ft` q4f16 0.33 GB; `onnx-community/Florence-2-large-ft` q4f16 0.86 GB | MIT |
| granite-docling-258M (Sep/Oct 2025) | 258M | Document→DocTags conversion | — | `onnx-community/granite-docling-258M-ONNX` q4f16 0.26 GB; `litert-community/granite-docling-258M` (24 Aug 2026) | Apache-2.0 |
| PaddleOCR-VL-1.6 (27 May 2026) | ~1B class | Document OCR VLM | — | `litert-community/PaddleOCR-VL-1.6` 1,390 MB `.litertlm`; GGUF `PaddlePaddle/PaddleOCR-VL-1.6-GGUF` | Apache-2.0 |
| InternVL3.5 1B/2B/4B | — | Yes | — | `litert-community/InternVL3_5-2B` `model.litertlm` 1,613 MB (also -1B, -4B) | Apache-2.0 (repo tag) |
| FastVLM-0.5B (Apple) | 0.5B | Yes | — | `onnx-community/FastVLM-0.5B-ONNX` q4f16 0.81 GB | apple-amlr (research-only) |
| MiniCPM-V 4.6 (13 Apr 2026), Moondream 3.1 9B-A2B (30 Jun 2026) | — | Yes | — | No web-ready (ONNX / MLC / litertlm) build found; Moondream2 has only `onnx-community/moondream2.text_model-ONNX` and `ggml-org/moondream2-20250414-GGUF` | not verified |
| Gemini Nano (Chrome Prompt API) | undisclosed | Yes (image input) | per-session `contextWindow` | Built into Chrome desktop only | Google ToS (no weights) |

Sources for the table rows:
- WebLLM prebuilt IDs and VRAM: Qwen3.5 0.8B/2B/4B/9B, Qwen3, Phi-3.5-vision (the only entry marked VLM), Phi-4-mini, Llama-3.2, gemma3-1b, gemma-2-2b, SmolLM2, Ministral-3-3B. All have 4,096-token context windows except the "-1k" variants. **No Gemma 3n/4, LFM, or Qwen-VL entries** — [web-llm src/config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- The mlc-ai HF org shows Qwen3.5 MLC weights uploaded 29 Mar–22 Apr 2026 (e.g. `mlc-ai/Qwen3.5-2B-q4f16_1-MLC`) — [mlc-ai on HF](https://huggingface.co/mlc-ai)
- WebLLM lists Qwen3.5 as text LLMs (no `model_type: VLM`), so **vision through WebLLM is not available for Qwen3.5**; the only WebLLM VLM is Phi-3.5-vision — [web-llm config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- Gemma 4 release on 2 Apr 2026: four vision-capable Apache-2.0 models (E2B, E4B, 31B, 26B-A4B MoE). E2B has 2.3B effective params and E4B 4.5B effective, both with 128K context and native audio — [Simon Willison](https://simonwillison.net/2026/apr/2/gemma-4)
- Gemma 4 E2B: "2.3B effective (5.1B with embeddings)", text/image/audio input, 128K, Apache 2.0, 35+ languages out of the box (pretrained on 140+), native structured tool use — [google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it)
- Gemma 4 E2B LiteRT-LM: main file ~2,583 MB. The "Web variant (2,008 MB) ... currently supports text-only inference". Decode ~25–56 tok/s on iPhone 17 Pro and 47–52 tok/s on Galaxy S26 Ultra (native, not web). Memory ranges from 607 MB (iPhone) to 3,681 MB (Jetson) — [litert-community/gemma-4-E2B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- LiteRT-LM Web API (`@litert-lm/core`) is an "early preview that supports text-in / text-out running in WebGPU". Only `gemma-4-E2B-it-web.litertlm` and `gemma-4-E4B-it-web.litertlm` are supported — [LiteRT-LM Web API](https://developers.google.com/edge/litert-lm/js)
- Gemma 4 E2B in the browser via transformers.js v4 with `onnx-community/gemma-4-E2B-it-ONNX` at dtype `q4f16`. The demo accepts image (and audio) input. The article names Chrome/Edge as the WebGPU browsers and says nothing about Safari — [PyImageSearch, 27 Jul 2026](https://pyimagesearch.com/2026/07/27/running-gemma-4-in-the-browser-with-transformers-js-and-webgpu/)
- Qwen3.5 small models (0.8B, 2B, 4B, 9B) were released 2 Mar 2026 under Apache 2.0. They are natively multimodal (text, image, video) with a 262,144-token context and a Gated DeltaNet hybrid-attention architecture — [GIGAZINE](https://gigazine.net/gsc_news/en/20260303-qwen-3-5-small); [Qwen/Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B)
- webml-community has an in-browser Qwen3.5 0.8B/2B/4B multimodal demo (transformers.js + WebGPU). It publishes no minimum memory requirement — [RuntimeWire, 18 Aug 2026](https://runtimewire.com/article/alibaba-qwen3-5-small-browser-demo-local-ai)
- LFM2.5-VL-1.6B: 1.2B LM + 400M vision, 32,768 context, native 512×512 with tiling, multi-image, function calling (text-only). Formats include `LiquidAI/LFM2.5-VL-1.6B-ONNX` and `-GGUF`, and there is a WebGPU demo Space `LiquidAI/LFM2.5-VL-1.6B-WebGPU` — [LiquidAI/LFM2.5-VL-1.6B](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B)
- LFM ONNX: "WebGPU supports Q4 and FP16 precision. Q8 quantization is not available in browser environments." LFM2.5-VL and LFM2-VL are exported at fp32/fp16/q4/q8 — [Liquid docs: ONNX](https://docs.liquid.ai/deployment/on-device/onnx)
- Qwen3-VL-2B: OCR in 32 languages, native 256K context expandable to 1M, Apache-2.0 — [Qwen/Qwen3-VL-2B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct). Qwen3-VL-4B-Instruct released 2025-10-15 with 256K context, Apache 2.0 — [DataLearner](https://www.datalearner.com/en/ai-models/pretrained-models/qwen3-vl-4b-instruct) (secondary)
- All ONNX/GGUF/litertlm sizes and the repo creation dates in the table come from the HF API file listings of the named repos, e.g. [onnx-community/Qwen3.5-2B-ONNX](https://huggingface.co/onnx-community/Qwen3.5-2B-ONNX), [onnx-community/gemma-4-E2B-it-ONNX](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/tree/main/onnx), [onnx-community/gemma-4-E2B-it-qat-mobile-ONNX](https://huggingface.co/onnx-community/gemma-4-E2B-it-qat-mobile-ONNX), [onnx-community/gemma-4-E4B-it-ONNX](https://huggingface.co/onnx-community/gemma-4-E4B-it-ONNX), [LiquidAI/LFM2.5-VL-1.6B-ONNX](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-ONNX), [onnx-community/LFM2.5-VL-450M-ONNX](https://huggingface.co/onnx-community/LFM2.5-VL-450M-ONNX), [onnx-community/Qwen3-VL-2B-Instruct-ONNX](https://huggingface.co/onnx-community/Qwen3-VL-2B-Instruct-ONNX), [onnx-community/Qwen3-VL-4B-Instruct-ONNX](https://huggingface.co/onnx-community/Qwen3-VL-4B-Instruct-ONNX), [onnx-community/Qwen2.5-VL-3B-Instruct-ONNX](https://huggingface.co/onnx-community/Qwen2.5-VL-3B-Instruct-ONNX), [litert-community/Qwen3.5-2B](https://huggingface.co/litert-community/Qwen3.5-2B), [litert-community/LFM2.5-VL-1.6B](https://huggingface.co/litert-community/LFM2.5-VL-1.6B), [LiquidAI/LFM2.5-VL-1.6B-Extract-GGUF](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-Extract-GGUF), [onnx-community/Florence-2-base-ft](https://huggingface.co/onnx-community/Florence-2-base-ft), [onnx-community/granite-docling-258M-ONNX](https://huggingface.co/onnx-community/granite-docling-258M-ONNX), [litert-community/PaddleOCR-VL-1.6](https://huggingface.co/litert-community/PaddleOCR-VL-1.6), [litert-community/SmolVLM2-500M](https://huggingface.co/litert-community/SmolVLM2-500M), [litert-community/InternVL3_5-2B](https://huggingface.co/litert-community/InternVL3_5-2B), [onnx-community/FastVLM-0.5B-ONNX](https://huggingface.co/onnx-community/FastVLM-0.5B-ONNX), [onnx-community/gemma-3n-E2B-it-ONNX](https://huggingface.co/onnx-community/gemma-3n-E2B-it-ONNX), [onnx-community/Phi-4-mini-instruct-web-q4f16](https://huggingface.co/onnx-community/Phi-4-mini-instruct-web-q4f16)
- Repo metadata quirk: the `onnx-community/gemma-4-E4B-it-ONNX` card lists `base_model: google/gemma-4-E2B-it`. This is probably a metadata typo, since the 5.18 GB q4f16 size matches a larger model — [HF repo](https://huggingface.co/onnx-community/gemma-4-E4B-it-ONNX)

### Inferences
- **Tablet-realistic tier (≤ ~2 GB download):** Qwen3.5-2B ONNX q4f16 (1.58 GB), Qwen3-VL-2B ONNX q4f16 (1.37 GB), LFM2.5-VL-1.6B (ONNX q4 1.49 GB; GGUF 696 MB + 583 MB mmproj ≈ 1.28 GB), Qwen3.5-0.8B (0.65 GB) and LFM2.5-VL-450M (0.32 GB) as "lite" options.
- **Heavy tier (2.5–5+ GB):** Gemma 4 E2B ONNX (3.38 GB q4f16, or ~2.57 GB with the qat-mobile q2f16 build), Qwen3.5-4B (3.0 GB), Qwen2.5-VL-3B (2.55 GB), LFM2.5-VL-3B (2.87 GB), Gemma 4 E4B (5.18 GB). Base iPads and 4–6 GB Android tablets will likely struggle with these.
- Most of the Gemma 4 E2B ONNX download is the 1.59 GB per-layer-embedding table. The table is used for lookups, so on paper it could live in CPU memory rather than GPU memory, but the actual browser RAM footprint was not measured in any source.
- Text-only runtimes (WebLLM for Qwen3.5/Phi-4-mini/Llama, and the LiteRT-LM web preview) can't read menu photos themselves. Using them for the chat agent means pairing them with a separate OCR/vision step (see Q5).

### Gaps
- Measured browser RAM/VRAM at runtime for the ONNX VLM builds (Qwen3.5-2B, LFM2.5-VL-1.6B, Gemma 4 E2B) on iPad Safari or Android Chrome: no primary source found. WebLLM's `vram_required_MB` is the only systematic number, and it covers text-only models.
- Whether MediaPipe LLM Inference Web (`.task` files exist: `gemma-4-E2B-it-web.task`, `gemma-4-E4B-it-web.task`) supports image input for Gemma 4 on web. The LiteRT-LM web docs say text-only, and MediaPipe web multimodal support was not checked in this pass.
- I did not check whether the `litert-community` Qwen3.5 / LFM2.5-VL / InternVL / PaddleOCR `.litertlm` files run under the LiteRT-LM Web API. The docs list only the Gemma 4 web files as supported, so they are probably native-only (Android/iOS) for now.
- Exact parameter counts and context for Gemma 3n E4B, SmolVLM2, MiniCPM-V 4.6 and Moondream 3.1 were not re-verified this session.

## Q2. Which web runtimes have ready-made builds?

### Takeaway
**transformers.js (ONNX Runtime Web, WebGPU)** has the widest vision coverage: Qwen3.5 0.8B/2B/4B, Qwen3-VL-2B, Qwen2.5-VL-3B, Gemma 4 E2B/E4B, Gemma 3n E2B, LFM2.5-VL 450M/1.6B/3B, Florence-2, granite-docling and FastVLM. **WebLLM** is text-only apart from Phi-3.5-vision. **LiteRT-LM Web / MediaPipe** officially supports only Gemma 4 E2B/E4B, text-only. **wllama** supports multimodal GGUF + mmproj but has a 2 GB per-file limit (files must be split). **Chrome Prompt API** has image input and JSON-schema output but runs on desktop only, with no Android or iPad support.

### Cited Findings
- WebLLM prebuilt list: Phi-3.5-vision-instruct (q4f16 3,952 MB) is the only VLM. Qwen3.5 0.8B–9B, Qwen3, Phi-4-mini, Llama-3.2 1B/3B, SmolLM2, gemma-2-2b and gemma3-1b are text-only. Context is 4,096 — [web-llm config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- LiteRT-LM Web: npm `@litert-lm/core`, WebGPU required, "early preview ... text-in / text-out". Supported models are `gemma-4-E2B-it-web.litertlm` and `gemma-4-E4B-it-web.litertlm` only — [LiteRT-LM Web API](https://developers.google.com/edge/litert-lm/js)
- The Gemma 4 E2B web `.litertlm` (2,008 MB) "currently supports text-only inference" — [litert-community/gemma-4-E2B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- transformers.js v4 runs Gemma 4 E2B (`onnx-community/gemma-4-E2B-it-ONNX`, q4f16) with image input in the browser — [PyImageSearch](https://pyimagesearch.com/2026/07/27/running-gemma-4-in-the-browser-with-transformers-js-and-webgpu/)
- ONNX Runtime added WebGPU support for Qwen3.5's LinearAttention and CausalConvWithState ops, and the webml-community demo runs the Qwen3.5 0.8B/2B/4B multimodal models — [RuntimeWire](https://runtimewire.com/article/alibaba-qwen3-5-small-browser-demo-local-ai)
- LFM: "WebGPU supports Q4 and FP16 precision. Q8 quantization is not available in browser environments" — [Liquid docs](https://docs.liquid.ai/deployment/on-device/onnx)
- wllama: "Multimodal support (image and audio file input)". WebGPU arrived in v3.1 with `n_gpu_layers`. "Max file size is 2GB, due to size restriction of ArrayBuffer", so models must be split with `llama-gguf-split` (512 MB chunks suggested) — [ngxson/wllama](https://github.com/ngxson/wllama)
- GGUF builds available for wllama: `LiquidAI/LFM2.5-VL-1.6B-GGUF`, `LiquidAI/LFM2.5-VL-1.6B-Extract-GGUF`, `LiquidAI/LFM2.5-VL-450M-Extract-GGUF`, `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` (Q4_0 696 MB), `ggml-org/SmolVLM2-*-GGUF`, `ggml-org/moondream2-20250414-GGUF`, `unsloth/gemma-3n-E2B-it-GGUF`, `PaddlePaddle/PaddleOCR-VL-1.6-GGUF` — HF API listings, e.g. [LiquidAI/LFM2.5-VL-1.6B-Extract-GGUF](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-Extract-GGUF)
- Chrome Prompt API: stable on the web from Chrome 138. It accepts image input (HTMLImageElement, Blob, ImageBitmap, etc.) and structured output through a JSON Schema `responseConstraint`. Requirements: Windows/macOS 13+/Linux/ChromeOS Chromebook Plus, **"No Android/iOS support"**, ≥22 GB free storage, >4 GB VRAM or 16 GB RAM + 4 cores. Languages: en, ja, es, de, fr — [Chrome Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api)
- Safari 26 (iOS/iPadOS 26) ships WebGPU on by default — [AppDeveloperMagazine](https://appdevelopermagazine.com/webgpu-in-ios-26/)

### Inferences
- **Chrome Prompt API / Gemini Nano is not an option for Yes Chef's target devices**: it doesn't run on iPad or Android tablets. At most it could be an opportunistic bonus on desktop Chrome.
- The most practical single runtime for a vision menu agent on both iPad Safari 26 and Android Chrome is **transformers.js v4 + WebGPU** with an onnx-community q4/q4f16 VLM. wllama with split GGUF is a fallback, mainly attractive for the LFM2.5-VL-Extract GGUFs, which have no ONNX build.
- If WebLLM is used, it can only serve the conversational/text side. Vision would need another runtime.

### Gaps
- No source confirmed that the Qwen3.5 or Gemma 4 ONNX VLM builds run stably on iPad Safari 26 WebGPU, given per-tab memory limits and buffer-size limits. This needs a device test.
- wllama's multimodal support for specific architectures (LFM2-VL, Qwen3.5 mmproj) in its bundled llama.cpp version was not verified.

## Q3. Instruction following, JSON reliability, tool calling, multilingual, license

### Takeaway
All three lead families advertise tool calling. Qwen3.5 covers 201 languages and Gemma 4 35+ out of the box. LFM2.5-VL covers 8 languages, and its Extract variant reports 99.6% JSON validity. Licensing favours **Qwen3.5 / Qwen3-VL / Gemma 4 (Apache-2.0)**, which allow unrestricted redistribution and self-hosting. LFM models are redistributable, but commercial use is capped at **$10M annual revenue**.

### Cited Findings
- Qwen3.5-2B: supports "201 languages and dialects", tool use with parser options, non-thinking mode by default (thinking can be enabled), Apache 2.0 — [Qwen/Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B)
- Gemma 4 E2B: "native support for structured tool use", 35+ languages out of the box (pretrained on 140+), Apache 2.0 — [google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it); Apache-2.0 for the whole Gemma 4 family — [Simon Willison](https://simonwillison.net/2026/apr/2/gemma-4)
- LFM2.5-VL-1.6B: English, Arabic, Chinese, French, German, Japanese, Korean, Spanish; function calling (text-only); "enhanced instruction following" — [LiquidAI/LFM2.5-VL-1.6B](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B)
- LFM2.5-VL-1.6B-Extract "extracts user-defined fields from images and returns them as JSON". Schemas are given as a YAML field list in the system prompt, with optional enum choices. It reports **99.6% JSON validity, 99.6% schema-consistency F1, 90.6% VLM-judge score**, beating FastVLM-1.5B and SmolVLM2-2.2B and "approaching" 4B+ models. It is meant for single-turn use with greedy decoding and is "not expected to transfer to ... multi-image reasoning or free-form VQA" — [LiquidAI/LFM2.5-VL-1.6B-Extract](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-Extract)
- LFM Open License v1.0: free redistribution in any medium with the license and notices included. Commercial use is conditioned on the licensee's annual revenue staying under **$10 million**, with non-profits exempt — [LFM license](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B/blob/main/LICENSE)
- Chrome Prompt API supports JSON-Schema-constrained output (`responseConstraint`) — [Chrome docs](https://developer.chrome.com/docs/ai/prompt-api)
- Repo license tags: Florence-2 MIT, granite-docling Apache-2.0, FastVLM `apple-amlr`, Gemma 3n `gemma`, PaddleOCR-VL-1.6 Apache-2.0, SmolVLM2 Apache-2.0, InternVL3.5 Apache-2.0 — HF API card metadata for the repos listed in Q1 (e.g. [onnx-community/FastVLM-0.5B-ONNX](https://huggingface.co/onnx-community/FastVLM-0.5B-ONNX))

### Inferences
- The menu agent needs multi-turn clarifying questions, so a general instruct VLM (Qwen3.5-2B or Gemma 4 E2B) fits the conversational role better than LFM2.5-VL-Extract, which is single-turn by design. Extract could still serve as a "photo → draft JSON" step inside a pipeline.
- Neither transformers.js nor wllama was shown here to do grammar/JSON-schema-constrained decoding for these VLMs, so the app should plan on validate-and-retry. (WebLLM does support JSON-schema/grammar mode for its text models, a commonly documented feature that was not re-verified this session.)
- Apache-2.0 models (Qwen3.5, Gemma 4) can be mirrored on Yes Chef's own CDN with no field-of-use or revenue conditions. Gemma 3n's Gemma Terms carry use-policy pass-through obligations. Llama 3.2's Community License requires attribution and has its own conditions.

### Gaps
- Published JSON-validity or tool-calling benchmarks for Qwen3.5-2B and Gemma 4 E2B specifically (e.g. BFCL, IFEval at small sizes) were not retrieved.
- The Qwen2.5-VL-3B license (believed to be the Qwen Research License, non-commercial, unlike the Apache-2.0 7B) was not verified this session. Treat it as **not cleared for commercial redistribution** until checked on the [model card](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct).
- The Llama 3.2 vision 11B was not evaluated. At q4 it would need several GB, and no WebLLM, onnx-community or LiteRT web build was found, so it isn't viable on tablets.

## Q4. Benchmark evidence for document/OCR understanding

### Takeaway
On OCR-centric benchmarks, the small Qwen models lead. Qwen3.5-2B reports OCRBench 84.5–85.4 and OmniDocBench ~80. Qwen3-VL-4B reports DocVQA ~91 and OCRBench ~85, though that comes from a secondary source. Gemma 4 E2B publishes OmniDocBench edit distance 0.290 but no OCRBench/DocVQA figure. LFM2.5-VL-1.6B is weaker on OCR (OCRBench v2 41.4, a different and harder scale).

### Cited Findings
- Qwen3.5 card (pairs are presumably two modes or settings, as printed): **OCRBench** 0.8B 74.5/79.1, 2B 84.5/85.4, 4B 80.8. **CC-OCR** 0.8B 63.2/66.7, 2B 72.9/75.8, 4B 73.8. **OmniDocBench** 0.8B 61.0/70.6, 2B 79.8/80.9, 4B 80.0. **MMMU** 0.8B 49/47.4, 2B 64.2, 4B 70.8 — [Qwen/Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B). Note: the 2B scoring above the 4B on OCRBench looks odd and may reflect different eval settings; check the original table.
- Qwen3.5-4B MMMU-Pro 65.4 vs Qwen3-VL-4B 52.0 and Qwen3-VL-8B 56.6 — [GIGAZINE / secondary summaries](https://gigazine.net/gsc_news/en/20260303-qwen-3-5-small)
- Qwen3-VL-4B Instruct: DocVQA ~91%, OCRBench ~85% (8B Instruct DocVQA 96.1, OCRBench 89.6) — [Codersera](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/) (secondary, approximate)
- Gemma 4 E2B: MMMU-Pro 44.2%, **OmniDocBench 1.5 = 0.290 (edit distance, lower is better)**, MATH-Vision 52.4% — [google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it)
- LFM2.5-VL-1.6B: OCRBench **v2** 41.44, InfoVQA (val) 62.71, MMMU (val) 40.56, MMBench 76.96, multilingual MMBench 65.90 — [LiquidAI/LFM2.5-VL-1.6B](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B)
- LFM2.5-VL-1.6B-Extract JSON-extraction eval: 99.6% JSON validity, 90.6% judge score, ahead of FastVLM-1.5B and SmolVLM2-2.2B — [LiquidAI/LFM2.5-VL-1.6B-Extract](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-Extract)

### Inferences
- For handwriting, chalkboard and whiteboard menus, OCR strength matters most. On the published OCR numbers, Qwen3.5-2B is the best quality-per-GB choice among web-ready models.
- Gemma 4's OmniDocBench edit distance (0.290) can't be compared with Qwen's OmniDocBench score (~80, a higher-is-better composite). The two cards use different metrics.

### Gaps
- No benchmark specifically covers menus, chalkboards or handwriting for these small models. An in-house eval set of ~30–50 real menu photos is recommended.
- No primary OCRBench/DocVQA figures found for Gemma 4 E2B/E4B, Qwen3-VL-2B (the card shows only charts), SmolVLM2, MiniCPM-V 4.6, Moondream 3.1 or PaddleOCR-VL-1.6.
- No independent benchmark of quantization loss (q4/q4f16 vs bf16) on OCR for these models was found.

## Q5. Text-only models worth pairing with a separate OCR step

### Takeaway
A two-stage pipeline makes sense when a model is needed for WebLLM (text-only) or the download must stay small. Possible OCR front-ends are **Florence-2-base-ft (0.33 GB q4f16, MIT)**, **granite-docling-258M (0.26 GB q4f16, Apache-2.0)** and the small VLMs (LFM2.5-VL-450M at 0.32 GB, Qwen3.5-0.8B at 0.65 GB). Possible text agents are **Qwen3.5-2B/Qwen3-1.7B (WebLLM)**, **LFM2.5-1.2B-Instruct / LFM2-1.2B-Extract / LFM2-1.2B-Tool (ONNX/GGUF)**, **Phi-4-mini (WebLLM/ONNX, 3.4 GB)** or **Llama-3.2-3B (WebLLM)**.

### Cited Findings
- Florence-2 ONNX builds: `onnx-community/Florence-2-base-ft` q4f16 0.33 GB, `onnx-community/Florence-2-large-ft` q4f16 0.86 GB, MIT — [onnx-community/Florence-2-base-ft](https://huggingface.co/onnx-community/Florence-2-base-ft)
- granite-docling-258M ONNX q4f16 0.26 GB (Apache-2.0), plus a LiteRT build `litert-community/granite-docling-258M` (24 Aug 2026) — [onnx-community/granite-docling-258M-ONNX](https://huggingface.co/onnx-community/granite-docling-258M-ONNX)
- Text models: `onnx-community/LFM2-1.2B-Extract-ONNX` q4f16 0.87 GB, `onnx-community/LFM2-1.2B-Tool-ONNX`, `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` Q4_0 696 MB, `onnx-community/granite-4.0-micro-ONNX-web` q4f16 2.30 GB (Apache-2.0), WebLLM `Qwen3-1.7B-q4f16_1-MLC` 2,037 MB / `Qwen3.5-2B-q4f16_1-MLC` 2,245 MB / `Llama-3.2-3B-Instruct-q4f16_1-MLC` 2,264 MB / `Phi-4-mini-instruct-q4f16_1-MLC` 3,438 MB — HF API listings ([onnx-community/LFM2-1.2B-Extract-ONNX](https://huggingface.co/onnx-community/LFM2-1.2B-Extract-ONNX)) and [web-llm config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)

### Inferences
- Because Qwen3.5 small models are natively multimodal, one Qwen3.5-2B ONNX download (1.58 GB) could replace an OCR + text-LLM pair. Two stages only pay off when the chat model must run on WebLLM, or when Florence-2 / docling gives better raw text on dense printed menus. That second point is untested.
- A suggested shortlist for the Yes Chef team to evaluate:
  1. **Default:** Qwen3.5-2B (`onnx-community/Qwen3.5-2B-ONNX`, q4f16 ~1.6 GB, Apache-2.0) via transformers.js. It handles both vision and chat, has 201 languages, and has the strongest published OCR scores at this size.
  2. **Lite/fast:** LFM2.5-VL-1.6B (ONNX q4 1.49 GB, or the Extract GGUF ~1.3 GB via wllama) or Qwen3.5-0.8B (0.65 GB). Note the LFM $10M revenue cap.
  3. **High-end tablets:** Gemma 4 E2B (`onnx-community/gemma-4-E2B-it-ONNX` 3.38 GB q4f16, or the qat-mobile ~2.6 GB build), Apache-2.0, with an official Google LiteRT-LM web path (text-only today).
- Moondream, MiniCPM-V, Phi-4-multimodal, InternVL and Llama 3.2 Vision currently have no web-ready build for transformers.js or WebLLM, so each would need conversion work.

### Gaps
- No head-to-head test of OCR-then-LLM versus a single VLM on menu photos was found.
- Florence-2 OCR quality on handwriting and chalkboards is undocumented in the sources retrieved.
