# In-browser LLM/VLM runtimes and platform support on tablets and phones (as of Oct 2026)

Research date: 2026-10-04. Where a source is undated or older, it says so. Several numbers come from secondary blogs and are marked that way. Many page summaries came through a fetch-and-summarize tool, so exact wording should be checked against the source before anything is quoted verbatim.

## 1. WebGPU status: iPad Safari, installed PWAs, Android Chrome, and limits

### Takeaway
WebGPU is on by default in Safari 26, which covers iOS/iPadOS 26, macOS 26 and visionOS 26. It has been on by default in Chrome on Android since Chrome 121 for Android 12+ devices with Qualcomm or ARM GPUs. So both target platforms now have WebGPU. The binding constraint is per-buffer limits and the memory budget, not whether the API exists. Safari's Metal backend reportedly caps buffers at about 256 MB on older iPhones and about 993 MB on iPad Pro.

### Cited Findings
- Safari 26 enables WebGPU by default on macOS Tahoe 26, iOS 26, iPadOS 26 and visionOS 26. Before that, iOS/iPadOS were the last major platform without it — [AppDeveloperMagazine "WebGPU in iOS 26"](https://appdevelopermagazine.com/WebGPU-in-iOS-26/); [Cinevva news 2025-09-15](https://app.cinevva.com/news/2025-09-15-safari-webgpu); [WWDC25 WebKit in Safari 26 beta summary](https://discuss.privacyguides.net/t/news-from-wwdc25-webkit-in-safari-26-beta/28226)
- Chrome 121 (Jan 2024) turned WebGPU on by default for Android 12+ devices with Qualcomm and ARM GPUs. Android 11 and other GPUs were to follow "gradually" — [Chrome for Developers: New in WebGPU 121](https://developer.chrome.com/blog/new-in-webgpu-121). Note this is a 2024 source. I did not find a 2026 list of supported Android GPUs. The LlamaWeb paper did run on a Samsung Galaxy S24 (Exynos/Xclipse GPU), which suggests Xclipse works at least on that device ([arXiv 2605.20706](https://arxiv.org/html/2605.20706)).
- f16 in WGSL (`shader-f16`) shipped in Chrome 120 — [Chrome WebGPU 121 blog](https://developer.chrome.com/blog/new-in-webgpu-121) (search snippet).
- The WebGPU spec only guarantees `maxBufferSize` = 256 MB and `maxStorageBufferBindingSize` = 128 MB. Higher values (around 1 GB) have to be requested and depend on the device — [webgpufundamentals: limits and features](https://webgpufundamentals.org/webgpu/lessons/webgpu-limits-and-features.html); [MDN GPUSupportedLimits](https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedLimits)
- Safari's Metal backend reportedly limits buffers to about 256 MB on iPhones and at most about 993 MB on iPad Pro — [tianpan.co blog, 2026-04-17](https://tianpan.co/blog/2026/04/17/browser-native-llm-inference-webgpu); [pinggy.io blog 2026](https://pinggy.io/blog/run_llm_in_browser_webgpu/). These are secondary sources and I could not find the primary WebKit reference.
- Exceeding the binding limit gives "Binding size is larger than the maximum binding size". Runtimes get around it by splitting weights into chunks — [webgpu-vram-pager README](https://github.com/nff747/webgpu-vram-pager)
- There is an open gpuweb proposal for a coarse "available memory" signal on GPUAdapter, which means pages currently cannot find out their memory budget — [gpuweb issue #6957](https://github.com/gpuweb/gpuweb/issues/6957)
- Transformers.js v4.3.0 (16 Sep 2026) release notes say "WebGPU enabled for Safari 26+" — [transformers.js releases](https://github.com/huggingface/transformers.js/releases)

### Inferences
- Installed PWAs on iPadOS run on the same WebKit engine as Safari, so WebGPU should be available in standalone mode on iPadOS 26. I found no source that confirms or contradicts this, so test on a real device.
- With per-buffer caps of about 1 GB, the model has to be sharded into tensors under 1 GB (WebLLM, ORT-Web and llama.cpp-WebGPU already do this). Total model size is limited by the process memory budget, not by the buffer cap.
- Feature-detect `shader-f16` at runtime and keep q4f32 variants as a fallback. Some Android GPUs and older iPads may not expose f16.

### Gaps
- No primary source (WebKit blog or Safari release notes) for the exact iPad `maxBufferSize` / `maxStorageBufferBindingSize` values on M-series vs A-series. Run webgpureport.org on target devices.
- No source on whether WebGPU behaves any differently in an installed iPadOS PWA (home-screen web app) than in Safari.
- No current (2026) list of Android GPUs and devices where Chrome blocks WebGPU.

## 2. Runtime-by-runtime comparison

### Takeaway
For a static PWA that needs vision and JSON output on both iPad Safari and Android Chrome, the realistic options are transformers.js v4 (ONNX Runtime Web WebGPU, with VLMs, structured output and tool calling), wllama v3 (llama.cpp with WebGPU, multimodal and tool calling) and WebLLM (best JSON-schema/grammar support, but text-focused). MediaPipe LLM Inference is in maintenance mode. Its successor, LiteRT-LM Web, is text-only. Chrome's Prompt API (Gemini Nano) is desktop-only and not available on Android. Apple Foundation Models is Swift-only and cannot be reached from a web page.

### Cited Findings

**transformers.js v4 (Hugging Face) / ONNX Runtime Web**
- v4.0.0 (30 Mar 2026) is a major rewrite with a new WebGPU runtime written in C++, built with the ONNX Runtime team and tested across about 200 architectures. The same code runs in browsers, Node, Bun and Deno — [transformers.js releases](https://github.com/huggingface/transformers.js/releases); [HowAIWorks v4 summary](https://howaiworks.ai/blog/transformers-js-v4-release)
- v4.1.0 (Apr 2026) added Gemma 4 and new quant types q1/q1f16/q2/q2f16. v4.2.0 (Apr 2026) added tool calling in TextGenerationPipeline. v4.3.0 (16 Sep 2026) added structured output through the separate `@huggingface/transformers-structured-output` package and enabled WebGPU for Safari 26+ — [releases](https://github.com/huggingface/transformers.js/releases)
- The listed vision-language models are SmolVLM, Qwen2.5-VL, Qwen3-VL, Florence(-2), Gemma 3n and LFM2-VL. Weights can be cached in the Cache API or OPFS, with WASM caching via `env.useWasmCache`, and there is a WASM fallback when WebGPU is missing — [releases](https://github.com/huggingface/transformers.js/releases). This came from a summarized page, so check model support per release.
- The project claims GPT-OSS 20B (q4f16) runs at about 60 tok/s on an M4 Pro Max (desktop) — [HowAIWorks](https://howaiworks.ai/blog/transformers-js-v4-release)
- License: Apache-2.0 (from training knowledge; not re-verified here).

**WebLLM (MLC AI)**
- Has an OpenAI-compatible API and streaming through AsyncGenerator. It runs in Web Workers and Service Workers. The README describes "state-of-the-art JSON mode structured generation" with custom schemas. Function calling is marked "(WIP)". Cache backends are the Cache API (default), IndexedDB, OPFS, and an experimental Cross-Origin Storage. License is Apache-2.0 — [GitHub mlc-ai/web-llm](https://github.com/mlc-ai/web-llm)
- The README's model list covers Llama, Phi, Gemma, Mistral and Qwen families. I found no current vision-language model in the README content I fetched — [GitHub web-llm](https://github.com/mlc-ai/web-llm). Uncertain: earlier versions shipped Phi-3.5-vision, but I could not confirm it is still supported.
- Desktop numbers: Llama 3.1 8B q4 at about 41 tok/s on an M3 Max (about 80% of native MLC), and Phi 3.5 Mini at about 71 tok/s — [tianpan.co 2026-04-17](https://tianpan.co/blog/2026/04/17/browser-native-llm-inference-webgpu) (secondary source).
- The LlamaWeb paper reports WebLLM memory leaks reaching about 10 GB on some setups — [arXiv 2605.20706 summary](https://www.alphaxiv.org/abs/2605.20706.md)

**wllama (llama.cpp WASM binding) and the llama.cpp WebGPU backend**
- wllama v3.x (unpkg shows 3.6.1 and 3.8.1) has WebGPU on by default since v3.1 (`n_gpu_layers`), image and audio input, native tool calling, an OAI-compatible `createChatCompletion`, and inference in a Web Worker. v3 reuses llama-server's `server-context.cpp` — [wllama README @3.6.1](https://app.unpkg.com/@wllama/wllama@3.6.1/files/README.md); [intro-v3 guide](https://app.unpkg.com/@wllama/wllama@3.6.1/files/guides/intro-v3.md)
- Limits: each file is capped at 2 GB because of ArrayBuffer, so larger models must be split into 512 MB GGUF shards. Multi-threading needs COOP/COEP headers (SharedArrayBuffer). On Safari/Firefox there is a WebGPU "compat" mode (`setCompat('default','firefox_safari')`) and the README says "performance will be significantly degraded" — [wllama README](https://app.unpkg.com/@wllama/wllama@3.6.1/files/README.md)
- llama.cpp itself supports GBNF grammar and JSON-schema-to-grammar. I did not confirm that wllama's v3 API exposes it.
- LlamaWeb (arXiv 2605.20706, 20 May 2026) is a WebGPU backend for llama.cpp that runs GGUF in the browser. It supports 23 weight formats, compared with 6 for WebLLM and 7 for transformers.js. It uses 29–33% less memory than WebLLM/transformers.js. For f16 Llama on Chrome, decode was 54–69% faster than the other runtimes, but prefill was only 49% of WebLLM's speed and 79% of transformers.js's — [arXiv 2605.20706](https://www.alphaxiv.org/abs/2605.20706.md); also covered by [youngju.dev 2026-07-16](https://www.youngju.dev/blog/2026-07-16-llama-cpp-webgpu-browser-inference.en)
- Caveat: one secondary blog (youngju.dev) phrases the memory result the other way round: "WebLLM came in 49% lower and Transformers.js 41% lower" in peak memory. Read the original Fig./Table before citing a direction.

**MediaPipe LLM Inference API (Web) → LiteRT-LM Web**
- MediaPipe LLM Inference is in maintenance-only mode, and Google recommends migrating to the LiteRT-LM JS API. Package: `@mediapipe/tasks-genai`. Formats: `.task`, `.bin`, `.litertlm`. Models: Gemma-3n E2B/E4B, Gemma 2B/7B, Phi-2, StableLM. Gemma-3n gives image and audio input (`maxNumImages > 0`, `supportAudio: true`). Streaming uses callbacks, and LoRA is supported. It requires WebGPU — [MediaPipe LLM Inference web guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js)
- LiteRT-LM Web API (`@litert-lm/core`) is an "early preview" and text-in/text-out only on WebGPU. Models are Gemma 4 E2B/E4B in `.litertlm` format. It supports streaming (`sendMessageStreaming`) and a thinking mode. Tool calling, constrained decoding and caching are not documented. Page last updated 4 Sep 2026 — [LiteRT-LM Web API](https://developers.google.com/edge/litert-lm/js)
- MediaPipe/LiteRT document no JSON-schema or grammar-constrained decoding on web.

**Chrome built-in AI: Prompt API (Gemini Nano)**
- The API is stable for web pages in Chrome 138+. Sampling parameters are in an origin trial from Chrome 148. It runs on Windows 10/11, macOS 13+, Linux and ChromeOS (Chromebook Plus only). It is **not supported on Chrome for Android or iOS**. Requirements: at least 22 GB free storage, and either a GPU with more than 4 GB VRAM or a CPU with 16 GB RAM and 4+ cores. The model downloads once over an unmetered connection — [Chrome for Developers: Prompt API (updated 26 Aug 2026)](https://developer.chrome.com/docs/ai/prompt-api)
- Multimodal input covers images (HTMLImageElement, ImageBitmap, Blob, ImageData), video frames and canvas, and audio. Structured output works through a JSON Schema `responseConstraint`. Streaming uses `promptStreaming()`. Languages: en, ja, es, de, fr — [Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api)

**Apple Foundation Models**
- Swift framework that shipped with iOS/iPadOS/macOS 26 — [Cult of Mac](https://www.cultofmac.com/news/apple-foundation-models-framework); [The Decoder](https://the-decoder.com/apples-new-foundation-models-framework-adds-on-device-ai-to-apps-with-three-lines-of-swift-code/). I found no JavaScript or Safari web API.

**WebNN**
- Chrome 146 beta moved WebNN to an origin trial. As of mid-2026 it runs only in the origin trial (Chrome 147–149) or behind flags. Safari does not support it and was only "considering" it as of Dec 2025 — [Phoronix Chrome 146 beta](https://www.phoronix.com/news/Chrome-146-Beta); [blink-dev Intent to Experiment](https://groups.google.com/a/chromium.org/g/blink-dev/c/5CWKSChYo98); [utsubo 2026 frontier APIs](https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready)

### Inferences
- **Prompt API is not an option** for this project: it is not on Android Chrome and not in Safari. It could only ever be an optional extra for desktop Chrome.
- **Apple Foundation Models is not reachable** from a PWA. It would need a native wrapper app.
- The best single-runtime fit for "photo of a menu → JSON" on both platforms is probably **transformers.js v4.3+**: it has VLMs (Qwen3-VL / SmolVLM / LFM2-VL / Gemma 3n), structured output, tool calling, OPFS caching, a WASM fallback, and explicit Safari 26 WebGPU support. **wllama v3** is the GGUF alternative with multimodal and tool calling, but its Safari WebGPU path is described as significantly degraded. **WebLLM** is a strong choice for schema-constrained JSON on a text-only path, for example after OCR.
- MediaPipe with Gemma 3n is the only Google-supported web VLM path, but it is in maintenance mode, so avoid it for new work.

### Gaps
- Bundle sizes (JS + WASM) for each runtime: not found.
- WebLLM's current release version, and whether it currently supports any VLM: not confirmed.
- Whether wllama exposes GBNF/JSON-schema constrained decoding: not confirmed.
- Whether transformers.js structured output works on the WebGPU backend for VLM pipelines: not confirmed.

## 3. Real-world performance on tablets and phones (1–4B models)

### Takeaway
I found almost no published, sourced tokens/s numbers for in-browser 1–4B models on iPads or Android flagships. The best primary source, the LlamaWeb paper from May 2026, groups the Galaxy S24 as "mid-tier" (able to run the full q4_k_m suite) and the iPhone 17 Pro Max and iPhone 15 as "low-power" (only the four smallest models ran). It gives no per-device tok/s.

### Cited Findings
- LlamaWeb evaluated 16 GPUs from 8 vendors. High tier: RTX 5080/5070, RX 7900 XT, Arc B580, Apple M4/M3. Mid tier: Iris Xe, Apple M2, Snapdragon X Elite, **Samsung Galaxy S24**. Low tier: **iPhone 17 Pro Max, iPhone 15**, ARM Mali, Qualcomm Adreno, PowerVR — [arXiv 2605.20706](https://www.alphaxiv.org/abs/2605.20706.md)
- On high-end GPUs, decode ran at about 30–100 tok/s and prefill at about 65–3000+ tok/s. Llama 3.2 1B q4_k_m on an Apple M3 decoded at about 52 tok/s — [arXiv 2605.20706](https://www.alphaxiv.org/abs/2605.20706.md)
- The iPhone 17 Pro Max could run only the four smallest models (LFM, Bonsai, Gemma 3, Qwen3 small variants). The paper gives no tok/s for iPhones — [arXiv 2605.20706 HTML](https://arxiv.org/html/2605.20706)
- Generic: on a recent integrated GPU, Qwen2.5-0.5B gets 0.5–2 s TTFT and 20–60 tok/s decode. WebGPU runs about 25–35% below native — [pinggy.io blog 2026](https://pinggy.io/blog/run_llm_in_browser_webgpu/) (secondary source, not device-specific).
- The WebGPU-Bench (llama.cpp WASM + WebGPU; Chromium JSPI, Firefox and WebKit asyncify builds) dashboard exists, but its methodology page lists no mobile results — [WebGPU Bench methodology](https://abhijitramesh-webgpu-bench.static.hf.space/methodology.html)

### Inferences
- The S24 is "mid" alongside the M2 and the iPhone 17 Pro Max is "low". An M-series iPad (M2/M4) probably performs about like the paper's Apple M2/M3 entries, as long as Safari's memory budget allows the model. A-series iPads probably perform like iPhones. Treat this as an extrapolation, not a measurement.
- For a menu agent, plan for roughly 1B-class text models and a sub-1B to 2B VLM on A-series iPads and mid-range Android, and up to about 3–4B q4 on M-series iPads and Snapdragon 8 Gen 3/Elite tablets. Benchmark on real devices before committing.

### Gaps
- No sourced tok/s, TTFT or image-encode times for iPad (M or A series), Snapdragon 8 Gen 3/8 Elite, or Tensor in a browser. Measure in-house (for example by running the WebGPU-Bench dashboard or transformers.js demos on target devices).
- No image-encoding latency numbers for browser VLMs on mobile.

## 4. Memory limits: Safari on iPad and Chrome on Android

### Takeaway
iOS/iPadOS gives web content a small, undocumented memory budget, and the system kills the WebContent or GPU process when it goes over. One 2026 paper says the iOS Safari tab limit is under 500 MB on the devices it tested. That is surprisingly low, and other reports suggest the limit varies by device. Small, quantized models (≤1–2 GB of weights) and careful freeing of GPU buffers are required.

### Cited Findings
- "On iOS devices Safari tab memory is limited to <500 MB" (LlamaWeb, tested on iPhone 15 / 17 Pro Max). This is why only the smallest models ran there — [arXiv 2605.20706 HTML](https://arxiv.org/html/2605.20706). Treat as device- and test-specific. No iPad was tested.
- Safari's Metal per-buffer caps are about 256 MB (iPhone) and about 993 MB (iPad Pro) — [tianpan.co](https://tianpan.co/blog/2026/04/17/browser-native-llm-inference-webgpu) (secondary source).
- WebKit bug 303203 (Blocker): a GPU-process memory leak on macOS/iPadOS 26 with a simple WebGPU app. It grew to about 650 MB until the system killed the process, affecting iPad A16, iPhone 12 and Mac M3. Cause: about 8 million tracked encoders. Fixed in WebKit main on 5 Dec 2025, so shipping Safari needs a later iPadOS 26.x point release — [WebKit Bugzilla 303203](https://bugs.webkit.org/show_bug.cgi?id=303203)
- GPUBuffers and textures are not garbage-collected and must be `destroy()`ed. Leaked weights (about 1 GiB after 5 route changes) eventually crash the tab — [SitePoint: profiling WebGPU memory](https://www.sitepoint.com/profiling-webgpu-memory-local-ai/)
- iOS caps web-content memory below physical RAM. Apple Developer Forums report web apps crashing only on iPadOS — [Apple Dev Forums thread 735018](https://developer.apple.com/forums/thread/735018) (older thread, about 2023).

### Inferences
- Plan for about 1–1.5 GB of total weights at most on iPad in the browser, and test whether M-series iPads with 8–16 GB allow more. Keep a smaller fallback model for A-series iPads.
- Running inference in a dedicated Worker and calling `device.destroy()` and buffer `destroy()` when the chat closes is required, not optional.

### Gaps
- No primary figure for the per-tab memory ceiling on M-series vs A-series iPads in iPadOS 26.
- No figure for Android Chrome's per-tab or GPU memory limits. In general the limit depends on device RAM and the Android low-memory killer.

## 5. Known failure modes

### Takeaway
The main risks are that Safari/iOS kills the WebContent or GPU process under memory pressure, GPU "device lost" after backgrounding, OOM from leaked GPU buffers, and large first-time downloads that may be evicted from storage. Thermal throttling on mobile is likely, but I found no browser-specific measurements.

### Cited Findings
- iPadOS 26 GPU-process leak with termination, fixed upstream Dec 2025 — [WebKit 303203](https://bugs.webkit.org/show_bug.cgi?id=303203)
- Runtime memory leaks: WebLLM about 10 GB on some setups (LlamaWeb). A Safari leak "causing tab termination on certain configurations" is also mentioned — [arXiv 2605.20706](https://arxiv.org/html/2605.20706). transformers.js reached about 10 GB before the tab died in Safari — [youngju.dev summary](https://www.youngju.dev/blog/2026-07-16-llama-cpp-webgpu-browser-inference.en) (the sources conflict over which runtime leaked; check the paper).
- Crashes at KV-cache depth 2048 on ARM Mali and PowerVR GPUs, even though depth 0 worked — [arXiv 2605.20706](https://www.alphaxiv.org/abs/2605.20706.md)
- Safari "A problem repeatedly occurred" tab reloads with heavy GPU content — [three.js forum](https://discourse.threejs.org/t/safari-a-problem-repeatedly-occurred/85343)
- wllama: files over 2 GB need splitting (ArrayBuffer limit), and Safari's WebGPU compat mode is much slower — [wllama README](https://app.unpkg.com/@wllama/wllama@3.6.1/files/README.md)
- WebGPU bugs across browsers are slowing in-browser AI (opinion piece) — [Medium, M. Emmerich](https://medium.com/@marcelo.emmerich/webgpu-bugs-are-holding-back-the-browser-ai-revolution-27d5f8c1dfca)

### Inferences
- Handle `GPUDevice.lost` and re-initialize. Save chat and draft-menu state to IndexedDB after every turn so a killed tab can resume.
- Call `navigator.storage.persist()` and store weights in OPFS or the Cache API. Show download size and progress, and allow deleting the model.
- Cap context at about 2k tokens on mobile, given the KV-depth crashes and the memory budget.

### Gaps
- No sourced data on thermal throttling curves for browser LLM inference on iPad or Android tablets.
- No source on WebGPU behaviour when an iOS PWA is backgrounded (for example whether the device is always lost or work is suspended).
