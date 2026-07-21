import apache from "highlight.js/lib/languages/apache";
import clojure from "highlight.js/lib/languages/clojure";
import cmake from "highlight.js/lib/languages/cmake";
import dart from "highlight.js/lib/languages/dart";
import django from "highlight.js/lib/languages/django";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import elixir from "highlight.js/lib/languages/elixir";
import erb from "highlight.js/lib/languages/erb";
import erlang from "highlight.js/lib/languages/erlang";
import fortran from "highlight.js/lib/languages/fortran";
import fsharp from "highlight.js/lib/languages/fsharp";
import glsl from "highlight.js/lib/languages/glsl";
import gradle from "highlight.js/lib/languages/gradle";
import groovy from "highlight.js/lib/languages/groovy";
import handlebars from "highlight.js/lib/languages/handlebars";
import haskell from "highlight.js/lib/languages/haskell";
import http from "highlight.js/lib/languages/http";
import latex from "highlight.js/lib/languages/latex";
import lisp from "highlight.js/lib/languages/lisp";
import matlab from "highlight.js/lib/languages/matlab";
import nginx from "highlight.js/lib/languages/nginx";
import nix from "highlight.js/lib/languages/nix";
import ocaml from "highlight.js/lib/languages/ocaml";
import pgsql from "highlight.js/lib/languages/pgsql";
import powershell from "highlight.js/lib/languages/powershell";
import properties from "highlight.js/lib/languages/properties";
import protobuf from "highlight.js/lib/languages/protobuf";
import scala from "highlight.js/lib/languages/scala";
import scheme from "highlight.js/lib/languages/scheme";
import shellSession from "highlight.js/lib/languages/shell";
import stylus from "highlight.js/lib/languages/stylus";
import twig from "highlight.js/lib/languages/twig";
import { common, createLowlight } from "lowlight";
import { markweaveBashGrammar } from "./codeblock-shell-grammar";

const markweaveCommonCodeBlockGrammars = {
  ...common,
  bash: markweaveBashGrammar,
  shell: markweaveBashGrammar,
};

const additionalMarkweaveCodeBlockGrammars = {
  apache,
  clojure,
  cmake,
  dart,
  django,
  dockerfile,
  elixir,
  erb,
  erlang,
  fortran,
  fsharp,
  glsl,
  gradle,
  groovy,
  handlebars,
  haskell,
  http,
  latex,
  lisp,
  matlab,
  nginx,
  nix,
  ocaml,
  pgsql,
  powershell,
  properties,
  protobuf,
  scala,
  scheme,
  "shell-session": shellSession,
  stylus,
  twig,
};

const markweaveCodeBlockLanguageAliases = {
  bash: ["nushell", "shellscript"],
  css: ["postcss"],
  ini: ["toml"],
  javascript: ["js", "jsx"],
  json: ["hjson", "json5", "jsonc", "jsonl", "jsonnet"],
  plaintext: ["text", "mermaid"],
  python: ["vyper"],
  sql: ["plsql"],
  typescript: ["ts", "tsx"],
  xml: ["angular-html", "html", "html-derivative", "vue-html"],
} as const;

export function createMarkweaveLowlight() {
  const lowlight = createLowlight(markweaveCommonCodeBlockGrammars);
  lowlight.register(additionalMarkweaveCodeBlockGrammars);
  lowlight.registerAlias(markweaveCodeBlockLanguageAliases);
  return lowlight;
}
