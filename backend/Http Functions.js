/*******************************************************
 * Spirit of Hope — Chat endpoint
 * Wix location: Backend → http-functions.js
 *
 * Live:    https://www.spiritofhopes.com/_functions/chat
 * Preview: https://www.spiritofhopes.com/_functions-dev/chat
 *
 * Response contract is unchanged from the n8n version:
 *   { ok, reply, sessionId }
 * so the front-end widget needs no edits.
 *******************************************************/

import { ok, badRequest, serverError } from 'wix-http-functions';
import { generateReply } from 'backend/chatEngine';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function post_chat(request) {
    try {
        const body = await request.body.json();
        const message = (body.message || '').toString();
        const sessionId = (body.sessionId || '').toString().trim() || ('anon_' + Date.now());

        if (!message.trim()) {
            return badRequest({
                headers: JSON_HEADERS,
                body: { ok: false, reply: '', error: 'Missing message' }
            });
        }

        const result = await generateReply(sessionId, message);

        return ok({
            headers: JSON_HEADERS,
            body: {
                ok: result.ok,
                reply: result.reply,
                sessionId: sessionId
            }
        });

    } catch (err) {
        console.error('chat endpoint error', err.message);
        return serverError({
            headers: JSON_HEADERS,
            body: {
                ok: false,
                reply: 'Sorry, something went wrong. Please call us at 240-423-3099.',
                error: 'internal'
            }
        });
    }
}