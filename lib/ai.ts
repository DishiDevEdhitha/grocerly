import type { IngredientInsight } from "./types";

/**
 * Optional AI layer (Gemini). It ONLY explains/classifies ingredients that the knowledge base
 * does not know. It never produces the score and never states regulatory facts.
 * Results are tagged source:"ai" and are excluded from scoring.
 */
export const aiAvailable = () => Boolean(process.env.GEMINI_API_KEY);

const SYSTEM = `You explain packaged-food ingredients for consumers. For each ingredient name return a JSON array of objects:
{"name": string, "category": string, "type": one of ["base_ingredient","preservative","sweetener","colour","flavouring","emulsifier","stabilizer","oil","salt","sugar","other"], "explanation": string (max 25 words, neutral), "allergen": string|null (one of milk, wheat, gluten, soy, peanuts, tree nuts, egg, fish, shellfish, sesame, or null), "confidence": number 0..1}.
Rules: Do NOT give health scores or ratings. Do NOT state whether an ingredient is banned or legal in any country. If unsure, say so in the explanation and lower the confidence. Output JSON only.`;

export async function interpretIngredients(names: string[], signal?: AbortSignal): Promise<IngredientInsight[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !names.length) return [];
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", signal: signal ?? ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(names.slice(0, 20)) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.name === "string" && typeof x.explanation === "string").map((x): IngredientInsight => ({
      name: String(x.name).slice(0, 80), category: String(x.category ?? "unclassified").slice(0, 40), type: String(x.type ?? "other").slice(0, 30),
      riskLevel: "none", // AI never assigns a risk level that could affect the score
      explanation: String(x.explanation).slice(0, 200), allergen: typeof x.allergen === "string" ? x.allergen : undefined,
      source: "ai", confidence: Math.min(0.7, Math.max(0, Number(x.confidence) || 0.3)),
    }));
  } catch { return []; } finally { clearTimeout(timer); }
}
