let running = 0;
export const decisionModel = () =>
  process.env.OPENAI_DECISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

export async function openAIResponse(payload, { apiKey, signal, fetcher = fetch } = {}) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (typeof key !== 'string' || !key.trim())
    throw new Error('Add an OpenAI key for this run or configure OPENAI_API_KEY on the server.');
  if (key.length > 1000 || /[\r\n]/.test(key)) throw new Error('Invalid OpenAI key.');
  if (running >= 2)
    throw Object.assign(new Error('Two OpenAI requests are already running. Try again shortly.'), {
      status: 429,
    });
  running++;
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.any([AbortSignal.timeout(60000), ...(signal ? [signal] : [])]),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, model: decisionModel(), store: false }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        `OpenAI returned HTTP ${response.status}. Check your key, model access and quota; no automatic fallback was used.`,
      );
    }
    let data;
    if (response.body) {
      const reader = response.body.getReader(),
        chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 1000000) throw new Error('OpenAI response exceeded the safe size limit.');
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      }
      try {
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new Error('OpenAI returned an unreadable response.');
      }
    } else data = await response.json();
    const content = data.output?.flatMap((item) => item.content || []);
    if ((data.status && data.status !== 'completed') || content?.some((c) => c.type === 'refusal'))
      throw new Error('OpenAI did not complete this decision. Review manually or retry.');
    return data;
  } finally {
    running--;
  }
}

export async function structuredDecision({
  name,
  schema,
  instructions,
  input,
  apiKey,
  signal,
  fetcher = fetch,
  maxTokens = 3500,
}) {
  const data = await openAIResponse(
    {
      max_output_tokens: maxTokens,
      instructions,
      input: JSON.stringify(input),
      text: { format: { type: 'json_schema', name, strict: true, schema } },
    },
    { apiKey, signal, fetcher },
  );
  try {
    return JSON.parse(
      data.output
        ?.flatMap((item) => item.content || [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join(''),
    );
  } catch {
    throw new Error('OpenAI returned an unreadable decision. No component was changed.');
  }
}
