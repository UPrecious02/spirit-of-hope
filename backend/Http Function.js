/*******************************************************
 * Spirit of Hope — Chat engine
 * Wix location: Backend → chatEngine.jsw
 *
 * Handles: knowledge base, conversation memory, LLM call.
 * Called by http-functions.js — not by page code.
 *******************************************************/

import { fetch } from 'wix-fetch';
import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';

/* ============================================================
   1. CONFIG
   ============================================================ */

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const SECRET_NAME = 'anthropic_api_key';   // name it exactly this in Secrets Manager

const COLLECTION = 'ChatSessions';
const MAX_TURNS_KEPT = 12;      // how many past messages to send back to the model
const MAX_TURNS_ALLOWED = 60;   // hard stop per session (abuse guard)
const MAX_MESSAGE_CHARS = 1000; // reject anything longer
const MAX_OUTPUT_TOKENS = 700;

/* ============================================================
   2. KNOWLEDGE BASE  ← REPLACE THIS BLOCK WITH YOUR FAQ CONTENT
   ------------------------------------------------------------
   Everything the bot knows lives here. Plain text is fine —
   headings and bullets help it find things. Keep it factual;
   anything not in here, the bot will say it doesn't know and
   point to the phone number.
   ============================================================ */

const KNOWLEDGE_BASE = `
## About Spirit of Hope
Spirit of Hope Home Health Care is an independently owned, locally operated non-medical
in-home care agency in Maryland. It is NOT a national franchise, which allows for more
personalised care and faster decision-making for families.
Phone: 240-423-3099
Website: spiritofhopes.com

## Service area
Howard County, Anne Arundel County, Montgomery County, and Baltimore County, Maryland.

## What home care is
Home health care lets seniors receive personal care, companionship, and support with daily
activities in their own home rather than moving into a facility.

## Home care vs home health care
Home care = non-medical support (bathing, meals, companionship).
Home health care = skilled nursing or therapy ordered by a physician.
Spirit of Hope specialises in non-medical home care. We do not provide skilled nursing,
therapy, or any medical treatment.

## Services provided
- Bathing, dressing, and personal care
- Meal preparation
- Medication reminders
- Light housekeeping
- Transportation
- Companionship
- Mobility assistance
- Specialised non-medical support for dementia and Alzheimer's, including supervision,
  routine-building, and safety monitoring. Caregivers are trained in memory care techniques
  to support clients ageing in place.
Services are tailored to each client's specific care plan.

## Signs a parent may need home care
Missed medications, unexplained weight loss, decline in home cleanliness, social withdrawal,
or difficulty with mobility and daily tasks. Spirit of Hope offers a FREE in-home assessment
to help families evaluate care needs.

## How quickly care can start
Care can often begin within a few days of the initial consultation, depending on caregiver
availability and the complexity of the care plan. Spirit of Hope prioritises fast turnaround
for families needing urgent support.

## Cost structure (NEVER quote dollar figures)
Costs vary by hours needed and level of care, and are typically billed hourly.
No long-term contract is required. Spirit of Hope offers a free consultation to build a
custom care plan and quote based on the family's specific needs.
Do not state, estimate, or guess any hourly rate or price. Direct pricing questions to the
free consultation.

## No long-term contracts
Spirit of Hope operates on a no-contract basis. Families can adjust or pause care as needs
change without being locked into a long-term agreement.

## Payment and coverage
- Medicare generally does NOT cover non-medical home care.
- Medicaid waiver programs, long-term care insurance, and VA benefits often DO.
- Spirit of Hope accepts VA home care benefits for eligible veterans.
- The team can help families understand which funding sources may apply to their situation.
For eligibility questions, direct people to call 240-423-3099.

## Consistent caregivers
Spirit of Hope is built around consistent caregiver assignment, so a client is cared for by
a familiar, trusted person rather than a rotating cast of strangers.

## Multilingual caregivers
Multilingual staff available, including caregivers who speak Spanish, Mandarin, and Amharic.

## Care Navigation Team
A dedicated group that helps families coordinate care, answer questions, and adjust care
plans over time. Acts as a single point of contact throughout the caregiving journey.

## Getting started
Families call 240-423-3099 for a free, no-obligation consultation with the Care Navigation Team.
A free in-home assessment is offered to evaluate care needs.
`;

/* ============================================================
   3. SYSTEM PROMPT
   ============================================================ */

const SYSTEM_PROMPT = `You are the website assistant for Spirit of Hope Home Healthcare, a non-medical in-home care agency in Maryland. You speak with families who are often stressed and researching care for an ageing parent or relative.

TONE
- Warm, calm, plain-spoken. Short paragraphs.
- Never salesy or pushy. Never rush the person.
- Answer the question first, then offer the next step if it fits naturally.

STRICT RULES
1. Only use the information in the KNOWLEDGE BASE below. If something is not covered there, say you're not sure and offer the phone number: 240-423-3099. Never invent details, staff names, credentials, prices, or availability.
2. Never state, estimate, or guess a dollar figure or hourly rate — not even a range, not even if pressed. You MAY explain how pricing works (hourly, varies by hours and level of care, no long-term contract required) and which funding sources may apply. Always point pricing questions to the free consultation.
3. Never give medical, clinical, diagnostic, or treatment advice. Spirit of Hope is non-medical. If someone describes a medical situation, express care briefly and direct them to their doctor or to the team.
4. If someone describes an emergency, tell them to call 911 immediately.
5. Do not ask for or store health details, diagnoses, medications, or medical history. If a visitor volunteers such details, do not repeat them back or record them — simply help with what they need.
6. You may collect a name, phone, and email if the person wants someone to contact them, and let them know the team will follow up.
7. Keep replies under about 150 words unless the person asks for more detail.
8. Use simple markdown for lists when it aids readability. No headings.

KNOWLEDGE BASE
${KNOWLEDGE_BASE}`;

/* ============================================================
   4. CONVERSATION MEMORY
   ============================================================ */

async function loadHistory(sessionId) {
    try {
        const res = await wixData
            .query(COLLECTION)
            .eq('sessionId', sessionId)
            .limit(1)
            .find({ suppressAuth: true });

        if (!res.items.length) return { item: null, messages: [] };

        const item = res.items[0];
        let messages = [];
        try {
            messages = JSON.parse(item.messages || '[]');
        } catch (e) {
            messages = [];
        }
        return { item, messages };
    } catch (e) {
        // Memory failure shouldn't break the chat — fall back to stateless.
        return { item: null, messages: [] };
    }
}

async function saveHistory(sessionId, item, messages, turnCount) {
    try {
        const trimmed = messages.slice(-MAX_TURNS_KEPT * 2);
        const payload = {
            sessionId: sessionId,
            messages: JSON.stringify(trimmed),
            turnCount: turnCount
        };
        if (item) {
            payload._id = item._id;
            await wixData.update(COLLECTION, payload, { suppressAuth: true });
        } else {
            await wixData.insert(COLLECTION, payload, { suppressAuth: true });
        }
    } catch (e) {
        // non-fatal
    }
}

/* ============================================================
   5. MAIN ENTRY
   ============================================================ */

export async function generateReply(sessionId, userMessage) {
    const message = (userMessage || '').toString().trim();

    if (!message) {
        return { ok: false, reply: 'Sorry, I didn\'t catch that. Could you try again?' };
    }
    if (message.length > MAX_MESSAGE_CHARS) {
        return { ok: false, reply: 'That message is a bit long for me. Could you shorten it, or call us at 240-423-3099?' };
    }

    const { item, messages } = await loadHistory(sessionId);

    if (item && (item.turnCount || 0) >= MAX_TURNS_ALLOWED) {
        return {
            ok: true,
            reply: 'We\'ve covered a lot here. For anything further, our Care Navigation Team can help directly at 240-423-3099.'
        };
    }

    const convo = messages.concat([{ role: 'user', content: message }]);

    let apiKey;
    try {
        apiKey = await getSecret(SECRET_NAME);
    } catch (e) {
        return { ok: false, reply: 'Sorry, I\'m unavailable right now. Please call us at 240-423-3099.' };
    }

    let reply;
    try {
        const res = await fetch(API_URL, {
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: MAX_OUTPUT_TOKENS,
                system: SYSTEM_PROMPT,
                messages: convo
            })
        });

        if (!res.ok) {
            const detail = await res.text();
            console.error('LLM error', res.status, detail.slice(0, 300));
            return { ok: false, reply: 'Sorry, I had trouble just then. Please try again, or call us at 240-423-3099.' };
        }

        const data = await res.json();
        reply = (data.content || [])
            .filter(function (b) { return b.type === 'text'; })
            .map(function (b) { return b.text; })
            .join('\n')
            .trim();

    } catch (err) {
        console.error('LLM exception', err.message);
        return { ok: false, reply: 'Sorry, I couldn\'t reach our system. Please call us at 240-423-3099.' };
    }

    if (!reply) {
        return { ok: false, reply: 'Sorry, I didn\'t get that. Could you rephrase, or call us at 240-423-3099?' };
    }

    convo.push({ role: 'assistant', content: reply });
    const nextTurnCount = ((item && item.turnCount) || 0) + 1;
    await saveHistory(sessionId, item, convo, nextTurnCount);

    return { ok: true, reply: reply };
}
