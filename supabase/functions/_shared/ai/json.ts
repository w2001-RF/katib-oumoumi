// Pulls a JSON object out of a model reply. Small and free models often wrap
// it in ```json fences or add a sentence before/after it.
export function parseJsonReply<T>(text: string): T {
  const unfenced = text.replaceAll(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(unfenced) as T;
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error(`No JSON object in model reply: ${text.slice(0, 200)}`);
    return JSON.parse(unfenced.slice(start, end + 1)) as T;
  }
}
