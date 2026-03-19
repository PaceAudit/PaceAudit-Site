import { readFileSync } from "fs";
import { join } from "path";

/**
 * Load Blader Humanizer skill instructions for blog writing.
 * The skill teaches how to avoid AI-writing patterns and add human voice.
 * We use it as writing guidelines when generating with Claude.
 */
export function loadHumanizerWritingGuidelines(): string {
  const paths = [
    join(process.cwd(), "humanizer-main", "humanizer-main", "SKILL.md"),
    join(process.cwd(), "humanizer-main", "SKILL.md"),
  ];
  for (const p of paths) {
    try {
      const raw = readFileSync(p, "utf8");
      const stripped = stripYamlFrontmatter(raw);
      return buildWritingGuidelinesFromSkill(stripped);
    } catch {
      continue;
    }
  }
  return getDefaultHumanizerGuidelines();
}

function stripYamlFrontmatter(text: string): string {
  const match = text.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  return match ? text.slice(match[0].length).trim() : text;
}

function buildWritingGuidelinesFromSkill(skillBody: string): string {
  // Extract the most valuable sections for generation: PERSONALITY AND SOUL, key pattern summaries
  // We limit length to ~2500 chars to keep prompt manageable
  const personalityMatch = skillBody.match(
    /## PERSONALITY AND SOUL[\s\S]*?(?=## CONTENT PATTERNS|## LANGUAGE|## STYLE|## COMMUNICATION|## FILLER|$)/i
  );
  const personality = personalityMatch
    ? personalityMatch[0]
        .replace(/### Before[\s\S]*?### After[\s\S]*?---/g, "")
        .replace(/\*\*Words to watch:\*\*[^\n]*\n?/g, "")
        .replace(/\*\*Problem:\*\*[^\n]*\n?/g, "")
        .trim()
        .slice(0, 1800)
    : "";

  return `## Human Writing Guidelines (Blader Humanizer)

Write in a natural, human voice. Avoid AI-writing patterns. Apply these rules when generating content:

${personality || getDefaultHumanizerGuidelines()}

**Avoid:** Significance inflation (testament, pivotal, evolving landscape), promotional language (nestled, breathtaking, vibrant), superficial -ing phrases (highlighting, showcasing, underscoring), vague attributions (Experts believe, Industry reports), em dash overuse, rule of three, AI vocabulary (Additionally, crucial, delve, enhance, foster, key, landscape, pivotal, showcase, underscore), copula avoidance (serves as, features, boasts → use is/has), negative parallelisms (It's not just X, it's Y), filler phrases (In order to, Due to the fact that), generic conclusions (The future looks bright).

**Prefer:** Direct statements, specific facts, varied sentence length, opinions where appropriate, simple constructions (is/are/has), concrete details over vague claims.`;
}

function getDefaultHumanizerGuidelines(): string {
  return `Write in a natural, human voice. Avoid AI-writing patterns:

- **Add voice:** Vary sentence length. Have opinions. Use "I" when it fits. Acknowledge complexity. Be specific about feelings.
- **Avoid:** Significance inflation (testament, pivotal, evolving landscape), promotional language (nestled, breathtaking, vibrant), superficial -ing phrases (highlighting, showcasing), vague attributions (Experts believe), em dash overuse, rule of three, AI vocabulary (Additionally, crucial, delve, enhance, foster, pivotal, showcase), copula avoidance (serves as → use is), filler phrases (In order to, Due to the fact that), generic conclusions.
- **Prefer:** Direct statements, specific facts, simple constructions (is/are/has), concrete details.`;
}
