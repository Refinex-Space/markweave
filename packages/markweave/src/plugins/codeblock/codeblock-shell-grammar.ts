import type { LanguageFn } from "highlight.js";
import bash from "highlight.js/lib/languages/bash";

function collectGrammarKeywords(keywords: ReturnType<LanguageFn>["keywords"]) {
  if (!keywords || typeof keywords === "string" || Array.isArray(keywords)) {
    return new Set<string>();
  }

  return new Set(
    Object.entries(keywords)
      .filter(([scope]) => scope !== "$pattern")
      .flatMap(([, words]) => (typeof words === "string" ? words.split(/\s+/) : Array.isArray(words) ? words : []))
      .map((word) => word.split("|")[0])
      .filter(Boolean),
  );
}

export const markweaveBashGrammar: LanguageFn = (hljs) => {
  const grammar = bash(hljs);
  const grammarKeywords = collectGrammarKeywords(grammar.keywords);

  return {
    ...grammar,
    contains: [
      {
        match: [/(?:^|\|\||&&|[|;])/, /[ \t]*/, /(?![A-Za-z_][\w]*[ \t]*=)[A-Za-z_./][\w./-]*/],
        scope: {
          1: "operator",
          3: "title.function",
        },
        relevance: 0,
        "on:begin": (match, response) => {
          if (grammarKeywords.has(match[3] ?? "")) {
            response.ignoreMatch();
          }
        },
      },
      {
        scope: "attr",
        match: /--?[A-Za-z][\w-]*/,
        relevance: 0,
      },
      {
        scope: "link",
        match: /https?:\/\/[^\s"'`|&;]+/,
        relevance: 0,
      },
      ...grammar.contains,
    ],
  };
};
