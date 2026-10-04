# Ingestion and Structured Output for an On-Device Menu Agent (as of 2026-10-04)

Scope: how a static PWA (iPad Safari, Android Chrome) can turn photos, PDFs, CSV/text and chat messages into the Yes Chef menu JSON using a 1-4B local model, ask clarifying questions, and reliably emit valid JSON. Research budget was limited (about 20 tool calls), so several items below are flagged as unverified or as gaps.

## 1. In-browser OCR options and quality/speed on mobile

### Takeaway
PaddleOCR PP-OCRv5 (mobile det+rec) on ONNX Runtime Web is now the strongest maintained in-browser OCR option, with an official SDK (`@paddleocr/paddleocr-js`, WASM or WebGPU) and community ports that report about 99% character accuracy on printed receipts. Tesseract.js is easy to set up but its maintainers say they do not work on recognition accuracy. Platform OCR is not a usable path for web pages: TextDetector is still behind an experimental flag, and I found no web API for iOS Live Text. No source gave handwriting or chalkboard accuracy for any browser engine.

### Cited Findings
- PaddleOCR ships an official browser SDK, `@paddleocr/paddleocr-js`, which runs the PP-OCR pipeline client-side on ONNX Runtime Web with **WASM and WebGPU** backends. It supports PP-OCRv5 mobile models ("PP-OCRv5_mobile_det", "PP-OCRv5_mobile_rec"), custom ONNX models, a Web Worker mode, and Blob/File/ImageBitmap/canvas inputs. **COOP/COEP headers are required for threaded WASM or WebGPU.** The docs give no Safari/iOS support statement and no benchmarks or model sizes. — [PaddleOCR docs: browser deployment](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html); [paddleocr-js README](https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.3.2/README.md)
- The community package `ppu-paddle-ocr` runs PP-OCRv5 graphs through ONNX Runtime (onnxruntime-web in the browser, enabling WebGPU when available). Its author reports **99.22% character accuracy on a receipt benchmark** (self-reported, printed text) and says it defaults to PP-OCRv5 mobile English models that are cached after first fetch. — [Medium: Deterministic OCR in JavaScript](https://medium.com/@awalariansyah7/deterministic-ocr-in-javascript-paddleocr-for-node-bun-deno-and-the-browser-4c5c3c3e7512); [ppu-paddle-ocr README](https://cdn.jsdelivr.net/npm/ppu-paddle-ocr@5.1.1/README.md); [JSR package](https://jsr.io/@snowfluke/ppu-paddle-ocr)
- Tesseract.js: v5 cut file sizes (54% smaller for English, 73% smaller for Chinese) and cut first-run runtime by about 50%. v6 reduced runtime and memory and fixed memory leaks. A v7 also exists (requires Node 16+). The README states that **"Tesseract.js does not modify the Tesseract recognition model to improve accuracy"** and that **"Tesseract.js does not support PDF files"**, and points to Scribe.js for both. It says nothing about handwriting. — [tesseract.js GitHub](https://github.com/naptha/tesseract.js)
- v6 disables output formats other than 'text' by default to save time, so layout and bounding-box output must be opted into. — [Transloadit devtips (Feb 2025)](https://transloadit.com/devtips/integrating-ocr-in-the-browser-with-tesseract-js/)
- In a CPU receipt study, Tesseract suffered "structure collapse" and "merged line items". The authors found that "worse OCR + better structure performed better than cleaner OCR + collapsed formatting". The study is qualitative and gives no numeric metrics. — [iunera: Testing OCR and AI models for structured receipt extraction](https://www.iunera.com/kraken/machine-learning-ai/testing-ocr-and-ai-models-for-structured-receipt-extraction/?amp)
- Shape Detection API `TextDetector`: Chrome documents text detection as an OCR interface, but testing it requires `#enable-experimental-web-platform-features`, and the text-recognition part is listed as still in progress. — [Chrome for Developers: Shape Detection](https://developer.chrome.com/docs/capabilities/shape-detection)
- Florence-2 has ONNX weights usable with Transformers.js. Transformers.js v3 enables WebGPU via `device: 'webgpu'`. — [Transformers.js v3 blog](https://www.huggingface.co/blog/transformersjs-v3); [Florence-2-base-ft ONNX README](https://huggingface.co/textagent/Florence-2-base-ft/blob/main/README.md)

### Inferences
- Recommended OCR default: PP-OCRv5 mobile through `@paddleocr/paddleocr-js` in a Worker. It also returns line boxes, and those boxes are what make a deterministic line/column parser possible. Use the WASM backend on iPad Safari if WebGPU is unavailable or unstable. Because COOP/COEP is required for threads, the static host must be able to set those headers, or a service-worker shim must add them.
- Tesseract.js is a reasonable lightweight fallback for clean printed menus. It is a poor fit for chalkboards, low contrast and stylized fonts, since the project explicitly does not improve accuracy.
- Do not plan around TextDetector or iOS Live Text. Neither is a dependable web API for Safari and Chrome tablets.

### Gaps
- No measured latency for PaddleOCR, Tesseract.js, Florence-2 or docTR on iPad or Android tablets was found.
- No handwriting or chalkboard accuracy data for any in-browser OCR engine was found. TrOCR (handwritten variant) and docTR ONNX ports were not researched within the budget.
- iOS Live Text: I found no source that says it is exposed to web pages. Users can manually copy Live Text from a photo and paste it into the chat, but that is unsourced and should be verified.
- PaddleOCR.js has no explicit Safari/iOS support statement.

## 2. VLM-direct (image to JSON) vs OCR-then-LLM for small models

### Takeaway
The only evidence found favors a pipeline: OCR, then structure/layout cleanup, then a small LLM, then deterministic validation. Small VLMs that run in the browser (SmolVLM 256M/500M, Florence-2) are demo-grade for document extraction. No benchmark of them on menus was found.

### Cited Findings
- One report found that a two-step pipeline (OCR, then a smaller LM for structuring) reached **99.1% accuracy vs 95.2% for Gemini 2.5 Flash end-to-end** on real invoices, at much lower cost. The source is a LinkedIn post, so treat it as practitioner evidence, not a peer-reviewed result. — [LinkedIn: "A good OCR pipeline beats top vision models at data extraction"](https://cy.linkedin.com/in/christoph-schillmeier)
- Practitioner receipt work (local CPU, about 100 receipts) reports frequent malformed JSON, missing brackets, duplicated fields, wrong nesting, hallucinated totals and broken arrays. It found deterministic validation to be "the single most important improvement" and concluded that pipeline design matters more than model size. — [iunera: Processing 100 receipts locally](https://www.iunera.com/kraken/enterprise-ai/processing-100-receipts-locally-with-ocr-and-llms-on-cpu/); [iunera: Why small local LLMs are viable](https://www.iunera.com/kraken/machine-learning-ai/why-small-local-llms-are-becoming-viable-for-receipt-automation/?amp)
- SmolVLM-256M-Instruct runs in-browser on WebGPU via Transformers.js (official example `smolvlm-webgpu`). — [HF Space README](https://www.huggingface.co/spaces/kimhyunwoo/SmolVLM-256M-Instruct-WebGPU/blob/main/README.md); [PyImageSearch, 2025-10-20](https://pyimagesearch.com/2025/10/20/running-smolvlm-locally-in-your-browser-with-transformers-js/)
- LightOn argues for small end-to-end OCR VLMs (LightOnOCR-1B) as an efficient domain-specific approach. That is server-side GPU evidence, not browser evidence. — [HF blog: LightOnOCR-1B](https://huggingface.co/blog/lightonai/lightonocr)
- Chrome's Prompt API accepts image inputs (ImageBitmap, canvas, Blob, etc.) with a JSON-schema `responseConstraint`, so image-to-JSON with Gemini Nano is technically possible. However, it is **desktop-only** (see Q4). — [Chrome Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api); [Raymond Camden, multimodal Prompt API (May 2025)](https://www.raymondcamden.com/2025/05/22/multimodal-support-in-chromes-built-in-ai)

### Inferences
- For 1-4B text models on tablets, the recommended flow is OCR with boxes, then a deterministic layout pass (group lines into blocks and columns, detect prices and section headers), then an LLM that maps the lines to categories, items and modifiers.
- A small VLM is best used as an optional assist for photos where OCR confidence is low (for example chalkboards), not as the primary path.

### Gaps
- No benchmark compared small browser VLMs (SmolVLM, Florence-2, Qwen2.5-VL-3B, Gemma 3n) with OCR+LLM on menus or receipts.
- No measured VLM latency on iPad or Android tablets was found.

## 3. PDF handling in the browser; CSV/text parsing

### Takeaway
Tesseract.js does not accept PDFs. The standard approach, using pdf.js to read the text layer of digital PDFs and to render image-only pages to a canvas for OCR, was not verified with sources in this session.

### Cited Findings
- Tesseract.js does not support PDF files. The project recommends Scribe.js for PDF OCR. — [tesseract.js GitHub](https://github.com/naptha/tesseract.js)

### Inferences
- Recommended design: if a pdf.js `getTextContent()` call returns text, use it; it is already in reading order with positions. Otherwise render each page to a canvas at about 2x scale and send it through the same OCR path as photos. Scribe.js is an alternative bundled option.
- CSV/text: parse deterministically, with no model. A header-mapping UI that maps columns to category, item and modifier, and creates modifier groups from repeated values, also serves as the fallback when no model is downloaded.

### Gaps
- No fetched source on pdf.js text-extraction API details or performance, or on CSV library choice (e.g. PapaParse). Both should be verified.

## 4. Constrained decoding / structured output in browser runtimes; JSON reliability of 1-4B models

### Takeaway
Grammar-constrained decoding is available in WebLLM (XGrammar compiled to WASM) and in llama.cpp-based runtimes (GBNF / JSON-Schema subset). Chrome's Prompt API also has a JSON-schema `responseConstraint`, but it is desktop-only and does not run on Android or iOS tablets. Constraints guarantee syntax, not correctness, and can hurt quality on small models or complex schemas.

### Cited Findings
- XGrammar was compiled to WebAssembly with JavaScript bindings and integrated into WebLLM for in-browser structured generation, "on portable devices like laptops and mobile phones". It guarantees structural correctness and supports JSON, regex and general CFGs. Its benchmarks were run on server hardware (H100/RTX 4090, Llama-3.1-8B), not mobile. (Blog dated 2024-11-22.) — [MLC blog: XGrammar](https://blog.mlc.ai/2024/11/22/achieving-efficient-flexible-portable-structured-generation-with-xgrammar); [XGrammar paper](https://arxiv.org/pdf/2411.15100)
- XGrammar reports up to 3.5x faster JSON-schema generation and 10x faster CFG generation than prior engines, with near-zero time-to-first-token and per-token overhead. XGrammar-2 (2026-05-04) targets tool calling and agents. — [XGrammar paper](https://arxiv.org/pdf/2411.15100); [MLC blog: XGrammar-2](https://blog.mlc.ai/2026/05/04/xgrammar-2-fast-customizable-structured-generation)
- llama.cpp GBNF grammars constrain output (for example forcing valid JSON). llama.cpp converts a **subset** of JSON Schema to GBNF, giving tokens that would break the schema zero probability. — [llama.cpp grammars README](https://raw.github.com/ggerganov/llama.cpp/master/./grammars/README.md); [Liquid AI: llama.cpp structured output](https://docs.liquid.ai/deployment/on-device/llama-cpp/structured-output)
- Chrome Prompt API facts:
  - Stable in Chrome 138, "full support" in Chrome 148.
  - **Supported only on Windows 10/11, macOS 13+, Linux and Chromebook Plus. "Chrome for Android, iOS, and ChromeOS on non-Chromebook Plus devices are not yet supported."**
  - Requires 22 GB free storage and more than 4 GB VRAM, or 16 GB RAM plus 4 cores.
  - `responseConstraint` takes a JSON Schema (or RegExp). An unsupported schema throws `NotSupportedError`. `omitResponseConstraintInput` keeps the schema out of the context, in which case the prompt should describe the format.
  - Overflowing the context drops older turns; a `QuotaExceededError` is thrown if the request still doesn't fit.
  
  — [Chrome Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api); [MDN LanguageModel.prompt()](https://developer.mozilla.org/docs/Web/API/LanguageModel/prompt)
- JSONSchemaBench (10K real schemas; evaluates Guidance, Outlines, llama.cpp, XGrammar, OpenAI and Gemini on coverage, compliance, efficiency and quality). Per a secondary summary, all frameworks score above 86% on simple schemas. On "GitHub-Hard" (deep nesting, recursion, patterns), the summary gives Guidance 41%, llama.cpp 39%, XGrammar 28% and Outlines 3%. These are likely empirical-coverage figures; check them against the paper. — [JSONSchemaBench arXiv 2501.10868](https://arxiv.org/abs/2501.10868); [Beancount summary, 2026-07-08](https://beancount.io/bean-labs/research-logs/2026/07/08/jsonschemabench-structured-outputs-language-models)
- Constrained decoding consistently enforces syntactic validity but does not reliably improve semantic accuracy, and **may degrade performance for smaller models or complex grammars**. (This claim comes from a secondary summary of related work.) — [Beancount summary](https://beancount.io/bean-labs/research-logs/2026/07/08/jsonschemabench-structured-outputs-language-models)
- Without constraints, small local models often produce malformed JSON, broken arrays and duplicated fields. — [iunera](https://www.iunera.com/kraken/enterprise-ai/processing-100-receipts-locally-with-ocr-and-llms-on-cpu/)

### Inferences
- On the target devices (iPad Safari, Android Chrome tablets), the Prompt API is not available as of Oct 2026. Use WebLLM with XGrammar (WebGPU) or wllama (WASM llama.cpp with GBNF) as the constrained path. Treat the Prompt API only as an optional desktop enhancement.
- Keep schemas flat and simple: no recursion, enums only for `select`, and simple id strings. The Yes Chef menu schema is shallow, which fits the high-coverage end of JSONSchemaBench.
- Have the model emit small objects (one category, or one patch op) instead of the whole menu. This limits both quality loss and token cost.

### Gaps
- I did not fetch WebLLM's API docs. Its `response_format` shape (`{type: "json_object", schema}` per memory) is unverified this session.
- I did not verify that wllama exposes a grammar option, or whether transformers.js has any built-in grammar/logits-processor support for JSON.
- No source covered MediaPipe LLM Inference (web) structured output, which I believe it lacks.
- No measured JSON-validity rates for 1-4B models with vs without constraints in a browser were found.

## 5. Agent design for small models (clarifying questions, patches, short context, repair)

### Takeaway
LLMs, especially smaller ones, under-clarify: they recognize ambiguity when asked directly but default to answering. Clarification should therefore be triggered by the app, not left to the model. For example, an explicit `questions` field, or deterministic checks (unpriced items, items without a category, ambiguous modifier select type) that produce questions.

### Cited Findings
- "Knowing but Not Showing" (Su & Cardie, arXiv, 2026-05-24): models identify ambiguous queries when explicitly asked to judge ambiguity, but in normal QA "overwhelmingly default to direct answers". Added retrieved context makes them even less likely to ask. — [arXiv 2605.25284](https://arxiv.org/abs/2605.25284)
- ClarifyMT-Bench (6,120 multi-turn dialogues) finds a consistent **under-clarification bias**, with LLMs answering prematurely and performance degrading as dialogue depth grows. It proposes "ClarifyAgent", which splits clarification into perception, forecasting, tracking and planning. — [arXiv 2512.21120](https://arxiv.org/html/2512.21120v1)
- CLAMBER (~12K items, ACL 2024): current LLMs have limited practical utility at identifying and clarifying ambiguous queries and produce low-quality clarifying questions. — [CLAMBER](https://arxiv.org/html/2405.12063v2); [ACL Anthology](https://aclanthology.org/2024.acl-long.578)
- Deterministic validation and correction layers were the biggest reliability win in small-model receipt extraction. — [iunera](https://www.iunera.com/kraken/enterprise-ai/processing-100-receipts-locally-with-ocr-and-llms-on-cpu/)

### Inferences
These are design recommendations derived from the findings above; none are separately sourced.
- **Output envelope.** Constrain every turn to `{ops:[...], questions:[{id, text, options?}]}`. Making `questions` a required field (it may be empty) turns clarification into a decision the model is prompted to make, which is a structural counter to under-clarification.
- **Ambiguity detection in a separate pass.** Use a short constrained call that asks "list ambiguities" before or after extraction. This exploits the "recognize when asked" finding.
- **Patch operations instead of full regeneration.** Use a small op vocabulary, e.g. `addCategory{name}`, `addItem{category, name}`, `addModifierGroup{name, select, required, options[]}`, `attachGroup{item, group}`, `rename`, `delete`. Apply the ops deterministically. Only a compact summary of the current menu (names only) goes back into the prompt.
- **IDs, dedupe and colors in code.** Generate ids (slug + counter) in code, never in the model. Dedupe and normalize case in code, and assign colors from a palette.
- **Validation and repair loop.** Validate with a JSON Schema validator plus referential checks (every modifierGroup id exists). On failure, re-prompt with just the error and the offending op, capped at 1-2 retries, then fall back to asking the user.
- **Chunking.** Process OCR output one section or column at a time to keep context short for 1-4B models.

### Gaps
- No paper specifically measured clarifying-question behavior of 1-4B models, or patch-based vs full-regeneration editing accuracy for small models.

## 6. Image preprocessing on device (resize, tile, HEIC, EXIF)

### Takeaway
On iPad Safari, HEIC can be avoided by restricting `accept` to JPEG/PNG, which makes Safari transcode. HEIC will not decode in Chrome. Orientation must be handled explicitly before drawing to a canvas.

### Cited Findings
- When an input lists `accept="image/jpeg, image/png, ..."` and the user picks an HEIC photo, **Safari transcodes it to the first listed type (JPEG)**. Since Safari 17, `accept="image/*,image/heic"` has odd conversion behavior, including converting JPG/PNG to HEIC. — [WebKit Bug 303803](https://bugs.webkit.org/show_bug.cgi?id=303803); [WebKit Bug 292350](https://bugs.webkit.org/show_bug.cgi?id=292350)
- No browser other than Safari 17+ decodes HEVC HEIC; `<img>`, `createImageBitmap()` and canvas fail in Chrome, Firefox and Edge. — [heic-normalize (libraries.io)](https://libraries.io/npm/heic-normalize)
- Mobile Safari can ignore EXIF orientation when drawing to canvas, producing rotated output. HEIC stores rotation as a container flag rather than an EXIF Orientation tag. — [codegenes: mobile Safari image upload](https://www.codegenes.net/blog/mobile-safari-image-upload-and-their-sizes/); [heic-normalize](https://libraries.io/npm/heic-normalize)

### Inferences
- Use `accept="image/jpeg,image/png,application/pdf,text/csv,text/plain"` so iPad photos arrive as JPEG.
- Decode with `createImageBitmap(file, {imageOrientation: 'from-image'})` and verify on real devices.
- Downscale to about 2000-2500 px on the long edge for OCR, which keeps memory safe on tablets.
- For small VLMs with 384-512 px inputs, tile large photos (for example 2x2 or 3x3 tiles with overlap) and merge the OCR text, or feed the VLM only cropped low-confidence regions.
- A grayscale/contrast or inversion step helps chalkboards (light text on dark background) for traditional OCR. This is unmeasured.

### Gaps
- No source confirmed how reliably `imageOrientation: 'from-image'` works in current iPadOS Safari.
- No measured guidance on tile sizes for specific browser VLMs.

## 7. Fallback when no model is downloaded

### Takeaway
A deterministic path is both feasible and recommended as the baseline:
- CSV/text import with column mapping.
- An OCR-to-lines parser: price regex, section-header heuristics, and indentation or "add"/"+" patterns for modifiers.

Validation and deterministic correction are the parts practitioners found most valuable anyway.

### Cited Findings
- Deterministic validation and correction were the single most important improvement in local receipt extraction, and structure-preserving OCR output mattered more than raw OCR accuracy. — [iunera](https://www.iunera.com/kraken/enterprise-ai/processing-100-receipts-locally-with-ocr-and-llms-on-cpu/); [iunera study](https://www.iunera.com/kraken/machine-learning-ai/testing-ocr-and-ai-models-for-structured-receipt-extraction/?amp)
- PP-OCR browser SDK output includes detection boxes, which a line/column grouping parser can use. Its visualization subpath renders those results. — [PaddleOCR browser docs](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html)

### Inferences
- The fallback parser:
  1. Cluster OCR boxes into lines and columns.
  2. Mark lines in all caps, larger text, or without a price as category headers.
  3. Mark lines with trailing prices as items.
  4. Treat lines like "add X / with Y or Z / choice of" as modifier-group candidates.
- Show the result in an editable review UI. The same parser output can be the input to the LLM when a model is present, so both paths share code.

### Gaps
- No published menu-specific rule-based parser or menu benchmark was found.
