import { saveChatMessage, getChatHistory } from '../database/database';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
let apiKey: string = '';

export function setApiKey(key: string) { apiKey = key; }
export function getApiKey(): string { return apiKey; }

export async function analyzeWithDeepSeek(
  prompt: string,
  systemPrompt: string = 'You are the NeverSoft Services AI, an intelligent file analysis assistant.'
): Promise<string> {
  if (!apiKey) return 'API key not configured. Set it in Settings.';
  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3, max_tokens: 2048
      })
    });
    if (!res.ok) return 'API Error (' + res.status + '): ' + (await res.text());
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No response.';
  } catch (e: any) { return 'Error: ' + e.message; }
}

export async function chatWithDeepSeek(userMessage: string): Promise<string> {
  if (!apiKey) return 'API key not configured. Set it in Settings.';
  await saveChatMessage('user', userMessage);
  try {
    const history = await getChatHistory(20);
    const messages = [
      { role: 'system', content: 'You are the NeverSoft Services AI, an intelligent file analysis assistant.' }
    ];
    for (const msg of history.reverse()) {
      messages.push({ role: msg.role, content: msg.content });
    }
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.5, max_tokens: 2048 })
    });
    if (!res.ok) return 'API Error (' + res.status + '): ' + (await res.text());
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'No response.';
    await saveChatMessage('assistant', reply);
    return reply;
  } catch (e: any) { return 'Error: ' + e.message; }
}

export async function extractEntitiesFromText(text: string, fileName: string): Promise<{
  entities: Array<{ type: string; value: string; context: string; confidence: number }>;
  summary: string; tags: string[]; categories: string[];
}> {
  const prompt = 'Analyze the following file content and extract all meaningful entities.\n\nFile: ' + fileName + '\n\nContent:\n"""\n' + text.substring(0, 4000) + '\n"""\n\nReturn JSON with: entities (array of {type, value, context, confidence}), summary (string), tags (array), categories (array). Extract people, places, emails, phone numbers, URLs, SKUs, dates, organizations. Return ONLY valid JSON.';
  const result = await analyzeWithDeepSeek(prompt, 'You are a precise entity extraction engine. Return only valid JSON.');
  try {
    const cleaned = result.replace(/"""json?/g, '').replace(/"""/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { entities: parsed.entities || [], summary: parsed.summary || '', tags: parsed.tags || [], categories: parsed.categories || [] };
  } catch {
    return { entities: [], summary: result, tags: [], categories: [] };
  }
}
