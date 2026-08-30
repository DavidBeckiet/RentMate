export const roommateAiExplanationPromptVersion = "ROOMMATE_AI_EXPLANATION_PROMPT_V1" as const;

export const roommateAiExplanationInstructions = `Explain only the supplied deterministic Roommate V2 compatibility evidence in the requested locale.
The V2 rules, category, dimensions, outcomes, and explanation codes are authoritative. Do not reinterpret or change them.
Do not invent source facts, personalities, protected traits, trust or safety conclusions, a score, ranking, guarantee, or prediction of successful cohabitation.
Use evidenceRefs only for exact supplied dimension/explanationCode pairs. Cautions are discussion points only and may reference only supplied DISCUSS or IMPORTANT_DIFFERENCE dimensions.
When an IMPORTANT_DIFFERENCE exists, acknowledge it through an exact evidenceRef. Return only the response schema object.`;

export const roommateAiExplanationPrompt = Object.freeze({
  version: roommateAiExplanationPromptVersion,
  instructions: roommateAiExplanationInstructions
});
