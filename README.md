# Spirit of Hope Home Healthcare: Website Code

Source files for [spiritofhopes.com](https://www.spiritofhopes.com), the Wix (Velo) site for Spirit of Hope Home Healthcare, a non-medical in-home care agency in Maryland serving Howard, Anne Arundel, Montgomery and Baltimore counties.

Wix is where the site actually runs. This repo is the working copy of everything custom that goes into it: the **Ask Hope** chatbot, the home safety assessment, page sections built as HTML embeds, blog components, and the assets behind them. Nothing here deploys automatically. Each file is pasted into the right place in Wix, as described below.

Built and maintained by PT Digital Studio (Precious Triumph).

Agency phone, used throughout the site and the chatbot: **240-423-3099**

---

## Folder map

| Folder / file | What's in it | Where it goes in Wix |
|---|---|---|
| `chatBot/` | Ask Hope chatbot: widget source and chat engine (current versions) | Custom Code + Backend |
| `backend/` | Velo backend: chat endpoint, assessment save, plus older chatbot copies | Backend (Code panel) |
| `customFunctions/` | Assessment survey, announcement bar, Klaviyo email templates | HTML embed / Custom Code / Klaviyo |
| `pages/` | Homepage and Home Care page sections | HTML embeds on those pages |
| `Service Pages/` | Service page sections and the Specialized Programs page handoff | HTML embeds on service pages |
| `blogs/` | Reusable blog post blocks (quote, callout, table, header) | HTML embeds inside blog posts |
| `card design.html` | "How it works" stacked step cards | HTML embed |
| `Assets/` | Logos, favicon, photos, hero images, section images | Wix Media |
| `Guides for Spirit of Hope/` | Downloadable PDF guides (lead magnets) | Wix Media / download links |
| `siteRevamp/` | Exported frames from the redesign | Reference only |
| `Untitled design/` | Duplicate logo and graphic exports | Reference only |

---

## Ask Hope chatbot

A floating chat bubble on every page that answers questions about the agency's services, service area, payment options and how to get started. It runs natively in Wix and calls the Anthropic API (Claude Haiku) directly. There is no third-party automation server in between.

### How it fits together

```
Visitor's browser                      Wix backend                        Anthropic
chatBot widget.html  ── POST ──▶  /_functions/chat              ──▶  Messages API
(Custom Code)                     (http-functions.js)                 (Claude Haiku)
                                         │
                                         ▼
                                  chatEngine.jsw
                                  knowledge base, system prompt,
                                  conversation memory (ChatSessions)
```

### Files

| Repo file | Wix destination |
|---|---|
| `chatBot/chatBot widget.html` | **Settings → Custom Code**. Place code in: Body - end · Add to pages: All pages · Load code on: Each new page · Code type: Functional. This is the readable source and must be minified before pasting (see below). |
| `chatBot/chatEngine.jsw` | **Backend → `chatEngine.jsw`**. The name must be exactly this, because the endpoint imports `backend/chatEngine`. |
| `backend/Http Functions.js` | **Backend → `http-functions.js`**. Exposes `post_chat`. |

`chatBot/chatEngine.jsw` is the current engine (Ask Hope name, owner section in the knowledge base). The copies in `backend/` are older; see [Cleanup](#cleanup-and-known-issues).

### One-time setup

1. **Secrets Manager:** add the Anthropic API key as a secret named exactly `anthropic_api_key`. It must never go in code.
2. **CMS collection `ChatSessions`:** fields `sessionId` (text), `messages` (text), `turnCount` (number), Admin-only permissions. Field keys are case-sensitive. If one is wrong, memory fails silently and the bot forgets earlier messages.
3. Billing and a monthly spend cap are set on the client's own Anthropic account. A $20/month cap is recommended.

### Response contract (don't change it)

`POST /_functions/chat` with `{ "message": "...", "sessionId": "..." }` returns:

```json
{ "ok": true, "reply": "...", "sessionId": "..." }
```

The website widget depends on this shape, and so will the planned Flutter app.

### Editing what the bot knows

Everything the bot knows is in **section 2, `KNOWLEDGE_BASE`**, of `chatEngine.jsw`. It's plain text inside a template literal. Add or edit `## Heading` blocks there, and don't add backticks inside it. Anything not in the knowledge base, the bot will say it doesn't know and give the phone number.

### Guardrails (agreed with the client, don't loosen without her)

- Never states a price, rate or dollar figure. It can explain how pricing works and which funding sources may apply.
- Never gives medical, clinical or diagnostic advice. The agency is non-medical.
- Emergencies: tells the visitor to call 911.
- Doesn't repeat back or record health details a visitor volunteers.
- Says it's an automated assistant if asked whether it's a real person.
- Message length and turns per session are capped to protect the API bill.

### Renaming the bot

The name appears in five places: `SYSTEM_PROMPT` line 1 in `chatEngine.jsw`, plus `soh-title`, `soh-avatar`, `GREETING` and `aria-label="Chat with …"` in the widget.

### Testing

The endpoint only works on the **published** site. In Preview the path is `/_functions-dev/chat`, so the widget errors there. That's expected. To test, open the live site's console and run:

```js
fetch('/_functions/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'What areas do you serve?', sessionId: 'test_001' })
}).then(r => r.json()).then(console.log);
```

If `ok` is `false`, check **Developer Tools → Logs** (real-time) for the `LLM error` line: 401 means a bad key, 400 "credit balance" means the account needs credits, 404 means the model ID needs updating (`MODEL` in `chatEngine.jsw`).

### Widget gotchas

- **No inline SVG in the widget.** Wix's global CSS overrides `fill` and `stroke` on SVGs injected through Custom Code, so all widget icons are CSS `background-image` data URIs. Inline SVG inside HTML embeds (iframes) is fine.
- **15,000-character cap per Custom Code block.** The readable source is about 19.5k, so minify it before pasting. The minified version is about 14k.
- **Grammarly attributes on the text box** (`data-gramm="false"`, etc.) stop the extension injecting elements that caused a horizontal scrollbar.
- Brand green in the widget is `--soh-green: #00544A`.

---

## Home safety assessment

A multi-step "Is your loved one safe at home?" questionnaire that scores the answers, shows a risk level with recommendations, saves the submission and emails it.

```
Announcement Bar ──▶ /survey-assessment page
                          │
                          ▼
   wix multipage assessment survey.html  (HTML embed / iframe)
                          │  window.parent.postMessage({ type: 'saveAssessment', ... })
                          ▼
   Page code on /survey-assessment  (not in this repo)
                          │  calls saveAssessment()
                          ▼
   backend/backend-wix.js ──▶ CMS: AssessmentSubmissions
                          └──▶ Klaviyo event "Assessment Submitted" (one per recipient)
                                        │
                                        ▼
                          Klaviyo flow emails using the templates below
```

| File | Purpose |
|---|---|
| `customFunctions/wix multipage assessment survey.html` | The survey UI, scoring and results screen. Goes in an HTML embed. |
| `backend/backend-wix.js` | `saveAssessment()`: writes to `AssessmentSubmissions` and fires Klaviyo events for two hard-coded recipients. |
| `customFunctions/Announcement Bar.html` | Fixed top bar linking to `/survey-assessment`. It pushes `#SITE_HEADER` down by 41px (60px on mobile). Custom Code. |
| `customFunctions/Client Assessment Notice.html` | Klaviyo email template: results for the family (`.txt` is an identical copy). |
| `customFunctions/email template.html` | Klaviyo email template: internal "new assessment submitted" notice. |

The page code on `/survey-assessment` that listens for the `postMessage` and calls `saveAssessment` lives only in Wix. It should be copied into this repo.

---

## Page sections

Each of these is a self-contained HTML embed with its own CSS and JS, built mobile-first with `clamp()` sizing. They use Inter Tight (plus Geist Mono for small uppercase labels), loaded with a Google Fonts `<link>` at the top of each file.

| File | Section |
|---|---|
| `pages/homepage-services.html` | Homepage services accordion (Personal & Companion Care, Memory & Neuro Care, Specialized Programs, Skilled Nursing, Hospital Stay & Exit Support) |
| `pages/services section.html` | Same services section, carousel variant |
| `pages/services list.html` | Hero typing effect: "Your Dedicated Caregivers For: Personal Care. / Safety Supervision. / …" |
| `pages/testimonial slide.html` | Scrolling review cards |
| `pages/homecare/homecare.html` | Animated "Counties and areas we serve" pills |
| `card design.html` | "How it works" stacked step cards, first one open |
| `Service Pages/homepage-service section.html` | Homepage services accordion, revised wording ("and" instead of "&") |
| `Service Pages/skilled-nursing-service.html` | Skilled Nursing services grid/accordion |
| `Service Pages/specialized-programs-services.html` | Specialized Programs services grid/accordion |
| `Service Pages/specialized-programs-page (2).html` | Full Specialized Programs page draft |
| `Service Pages/specialized-programs-page-STANDALONE (3).html` | Same page with images embedded, for previewing anywhere (~800 KB, not for Wix) |
| `Service Pages/specialized-programs-handoff.zip` | Handoff pack: images, icons, components and `NOTES.txt` (section order, slugs, SEO, copy to confirm with the client) |

Accordion convention across the site: first item open on load, one open at a time, one always open.

---

## Blog components

Drop-in blocks for blog posts, pasted as HTML embeds:

| File | Block |
|---|---|
| `blogs/blog template.html` | Gradient header / intro block |
| `blogs/blogsCode.html` | Pull-quote block |
| `blogs/callouts_blog.html` | Callout / key-takeaway block |
| `blogs/blog_table.html` | Comparison table (e.g. depression vs dementia), horizontally scrollable on mobile |

Keep the Google Fonts `<link>` in only one embed per post to avoid font flicker.

---

## Brand

| Token | Value | Use |
|---|---|---|
| Primary green | `#00544A` | Buttons, header, key accents |
| Secondary grey | `#ECECEC` | Secondary buttons, dividers |
| Accent yellow | `#FFDA44` | Icons and links only, never large blocks |

Typography is Inter Tight, with Geist Mono for small uppercase labels. Layouts stay white and light, because the audience is older clients and their adult children.

---

## Cleanup and known issues

- **Duplicate and misnamed chatbot files in `backend/`:**
  - `Http Function.js` and `chatEngine.js` are identical copies of an **older** chat engine (no Ask Hope name, no owner section), despite the first one's name.
  - `chatEngine (1).jsw` is empty.
  - The current engine is `chatBot/chatEngine.jsw`. The three files above can be deleted.
- **Two homepage services files** (`pages/homepage-services.html` and `Service Pages/homepage-service section.html`) differ only in "&" vs "and". Keep whichever is live.
- **`Client Assessment Notice.txt`** duplicates the `.html`.
- **Assessment page code is missing** from the repo (see above).
- **Klaviyo API key is hard-coded** in `backend/backend-wix.js`. It should move to Wix Secrets Manager and be read with `getSecret()`, the same way the chatbot handles its key.
- **`.jsw` web modules are callable from any browser.** `saveAssessment` can be called directly with arbitrary data. Moving it behind an HTTP function with validation would close that.
- **Photo licences:** confirm every Unsplash/Pexels download is free-licence before launch (see the handoff `NOTES.txt`).
