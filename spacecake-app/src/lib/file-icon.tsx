import AstroIcon from "@pierre/vscode-icons/svgs/astro.svg?react"
import BabelIcon from "@pierre/vscode-icons/svgs/babel.svg?react"
import BashIcon from "@pierre/vscode-icons/svgs/bash-duo.svg?react"
import BiomeIcon from "@pierre/vscode-icons/svgs/biome.svg?react"
import BootstrapIcon from "@pierre/vscode-icons/svgs/bootstrap-duo.svg?react"
import JsonIcon from "@pierre/vscode-icons/svgs/braces.svg?react"
import BrowserslistIcon from "@pierre/vscode-icons/svgs/browserslist-duo.svg?react"
import BunIcon from "@pierre/vscode-icons/svgs/bun.svg?react"
import ClaudeIcon from "@pierre/vscode-icons/svgs/claude.svg?react"
import DockerIcon from "@pierre/vscode-icons/svgs/docker.svg?react"
import EslintIcon from "@pierre/vscode-icons/svgs/eslint.svg?react"
import DefaultIcon from "@pierre/vscode-icons/svgs/file-duo.svg?react"
import TableIcon from "@pierre/vscode-icons/svgs/file-table-duo.svg?react"
import TextIcon from "@pierre/vscode-icons/svgs/file-text-duo.svg?react"
import ZipIcon from "@pierre/vscode-icons/svgs/folder-zip-duo.svg?react"
import FontIcon from "@pierre/vscode-icons/svgs/font.svg?react"
import GitIcon from "@pierre/vscode-icons/svgs/git.svg?react"
import GraphqlIcon from "@pierre/vscode-icons/svgs/graphql.svg?react"
import ImageIcon from "@pierre/vscode-icons/svgs/image-duo.svg?react"
import CssIcon from "@pierre/vscode-icons/svgs/lang-css-duo.svg?react"
import GoIcon from "@pierre/vscode-icons/svgs/lang-go.svg?react"
import HtmlIcon from "@pierre/vscode-icons/svgs/lang-html-duo.svg?react"
import JavaScriptIcon from "@pierre/vscode-icons/svgs/lang-javascript-duo.svg?react"
import MarkdownIcon from "@pierre/vscode-icons/svgs/lang-markdown.svg?react"
import PythonIcon from "@pierre/vscode-icons/svgs/lang-python.svg?react"
import RubyIcon from "@pierre/vscode-icons/svgs/lang-ruby.svg?react"
import RustIcon from "@pierre/vscode-icons/svgs/lang-rust.svg?react"
import SwiftIcon from "@pierre/vscode-icons/svgs/lang-swift.svg?react"
import TypeScriptIcon from "@pierre/vscode-icons/svgs/lang-typescript-duo.svg?react"
import McpIcon from "@pierre/vscode-icons/svgs/mcp.svg?react"
import NextjsIcon from "@pierre/vscode-icons/svgs/nextjs.svg?react"
import NpmIcon from "@pierre/vscode-icons/svgs/npm-duo.svg?react"
import OxcIcon from "@pierre/vscode-icons/svgs/oxc.svg?react"
import PostcssIcon from "@pierre/vscode-icons/svgs/postcss.svg?react"
import PrettierIcon from "@pierre/vscode-icons/svgs/prettier.svg?react"
import ReactIcon from "@pierre/vscode-icons/svgs/react.svg?react"
import SassIcon from "@pierre/vscode-icons/svgs/sass.svg?react"
import DatabaseIcon from "@pierre/vscode-icons/svgs/server-duo.svg?react"
import StylelintIcon from "@pierre/vscode-icons/svgs/stylelint.svg?react"
import SvelteIcon from "@pierre/vscode-icons/svgs/svelte.svg?react"
import SvgFileIcon from "@pierre/vscode-icons/svgs/svg-2.svg?react"
import SvgoIcon from "@pierre/vscode-icons/svgs/svgo.svg?react"
import TailwindIcon from "@pierre/vscode-icons/svgs/tailwind.svg?react"
import TerraformIcon from "@pierre/vscode-icons/svgs/terraform.svg?react"
import ViteIcon from "@pierre/vscode-icons/svgs/vite.svg?react"
import VscodeIcon from "@pierre/vscode-icons/svgs/vscode.svg?react"
import VueIcon from "@pierre/vscode-icons/svgs/vue.svg?react"
import WasmIcon from "@pierre/vscode-icons/svgs/wasm-duo.svg?react"
import WebpackIcon from "@pierre/vscode-icons/svgs/webpack.svg?react"
import YmlIcon from "@pierre/vscode-icons/svgs/yml.svg?react"
import ZigIcon from "@pierre/vscode-icons/svgs/zig.svg?react"
/**
 * File icon resolution using @pierre/vscode-icons (MIT).
 * Token mapping adapted from @pierre/trees (Apache 2.0).
 * Copyright pierre computer company — https://github.com/pierrecomputer/pierre
 */
import type { SVGProps } from "react"

type SvgComponent = React.FC<SVGProps<SVGElement>>

const TOKEN_ICONS: Record<string, SvgComponent> = {
  astro: AstroIcon,
  babel: BabelIcon,
  bash: BashIcon,
  biome: BiomeIcon,
  bootstrap: BootstrapIcon,
  browserslist: BrowserslistIcon,
  bun: BunIcon,
  claude: ClaudeIcon,
  css: CssIcon,
  database: DatabaseIcon,
  default: DefaultIcon,
  docker: DockerIcon,
  eslint: EslintIcon,
  font: FontIcon,
  git: GitIcon,
  go: GoIcon,
  graphql: GraphqlIcon,
  html: HtmlIcon,
  image: ImageIcon,
  javascript: JavaScriptIcon,
  json: JsonIcon,
  markdown: MarkdownIcon,
  mcp: McpIcon,
  nextjs: NextjsIcon,
  npm: NpmIcon,
  oxc: OxcIcon,
  postcss: PostcssIcon,
  prettier: PrettierIcon,
  python: PythonIcon,
  react: ReactIcon,
  ruby: RubyIcon,
  rust: RustIcon,
  sass: SassIcon,
  stylelint: StylelintIcon,
  svelte: SvelteIcon,
  svg: SvgFileIcon,
  svgo: SvgoIcon,
  swift: SwiftIcon,
  table: TableIcon,
  tailwind: TailwindIcon,
  terraform: TerraformIcon,
  text: TextIcon,
  typescript: TypeScriptIcon,
  vite: ViteIcon,
  vscode: VscodeIcon,
  vue: VueIcon,
  wasm: WasmIcon,
  webpack: WebpackIcon,
  yml: YmlIcon,
  zig: ZigIcon,
  zip: ZipIcon,
}

// -- token resolution (adapted from @pierre/trees, Apache 2.0) ---------------

const FILE_NAME_TOKENS: Record<string, string> = {
  ".babelrc": "babel",
  ".babelrc.json": "babel",
  ".bash_profile": "bash",
  ".bashrc": "bash",
  ".browserslistrc": "browserslist",
  ".dockerignore": "docker",
  ".eslintignore": "eslint",
  ".eslintrc": "eslint",
  ".eslintrc.cjs": "eslint",
  ".eslintrc.js": "eslint",
  ".eslintrc.json": "eslint",
  ".eslintrc.yaml": "eslint",
  ".eslintrc.yml": "eslint",
  ".gitattributes": "git",
  ".gitignore": "git",
  ".gitkeep": "git",
  ".gitmodules": "git",
  ".oxlintrc.json": "oxc",
  ".postcssrc": "postcss",
  ".postcssrc.json": "postcss",
  ".postcssrc.yaml": "postcss",
  ".postcssrc.yml": "postcss",
  ".prettierignore": "prettier",
  ".prettierrc": "prettier",
  ".prettierrc.cjs": "prettier",
  ".prettierrc.js": "prettier",
  ".prettierrc.json": "prettier",
  ".prettierrc.mjs": "prettier",
  ".prettierrc.toml": "prettier",
  ".prettierrc.yaml": "prettier",
  ".prettierrc.yml": "prettier",
  ".stylelintignore": "stylelint",
  ".stylelintrc": "stylelint",
  ".stylelintrc.cjs": "stylelint",
  ".stylelintrc.js": "stylelint",
  ".stylelintrc.json": "stylelint",
  ".stylelintrc.mjs": "stylelint",
  ".stylelintrc.yaml": "stylelint",
  ".stylelintrc.yml": "stylelint",
  ".terraform.lock.hcl": "terraform",
  ".zprofile": "bash",
  ".zshenv": "bash",
  ".zshrc": "bash",
  "babel.config.cjs": "babel",
  "babel.config.js": "babel",
  "babel.config.json": "babel",
  "babel.config.mjs": "babel",
  "biome.json": "biome",
  "biome.jsonc": "biome",
  "bootstrap.bundle.js": "bootstrap",
  "bootstrap.bundle.min.js": "bootstrap",
  "bootstrap.css": "bootstrap",
  "bootstrap.js": "bootstrap",
  "bootstrap.min.css": "bootstrap",
  "bootstrap.min.js": "bootstrap",
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "bunfig.toml": "bun",
  "claude.md": "claude",
  "compose.yaml": "docker",
  "compose.yml": "docker",
  "docker-compose.override.yml": "docker",
  "docker-compose.yaml": "docker",
  "docker-compose.yml": "docker",
  dockerfile: "docker",
  "eslint.config.cjs": "eslint",
  "eslint.config.js": "eslint",
  "eslint.config.mjs": "eslint",
  "eslint.config.mts": "eslint",
  "eslint.config.ts": "eslint",
  gemfile: "ruby",
  "next.config.js": "nextjs",
  "next.config.mjs": "nextjs",
  "next.config.mts": "nextjs",
  "next.config.ts": "nextjs",
  "package.json": "npm",
  "package-lock.json": "npm",
  "postcss.config.cjs": "postcss",
  "postcss.config.js": "postcss",
  "postcss.config.mjs": "postcss",
  "postcss.config.ts": "postcss",
  "prettier.config.cjs": "prettier",
  "prettier.config.js": "prettier",
  "prettier.config.mjs": "prettier",
  rakefile: "ruby",
  "readme.md": "markdown",
  "stylelint.config.cjs": "stylelint",
  "stylelint.config.js": "stylelint",
  "stylelint.config.mjs": "stylelint",
  "svgo.config.cjs": "svgo",
  "svgo.config.js": "svgo",
  "svgo.config.mjs": "svgo",
  "svgo.config.ts": "svgo",
  "tailwind.config.cjs": "tailwind",
  "tailwind.config.js": "tailwind",
  "tailwind.config.mjs": "tailwind",
  "tailwind.config.ts": "tailwind",
  "tsconfig.json": "typescript",
  "tsconfig.build.json": "typescript",
  "vite.config.js": "vite",
  "vite.config.mjs": "vite",
  "vite.config.mts": "vite",
  "vite.config.ts": "vite",
  "webpack.config.babel.js": "webpack",
  "webpack.config.cjs": "webpack",
  "webpack.config.js": "webpack",
  "webpack.config.mjs": "webpack",
  "webpack.config.ts": "webpack",
}

const FILE_EXTENSION_TOKENS: Record<string, string> = {
  "7z": "zip",
  astro: "astro",
  avif: "image",
  bash: "bash",
  bmp: "image",
  bz2: "zip",
  cfg: "text",
  cjs: "javascript",
  "code-workspace": "vscode",
  conf: "text",
  csh: "bash",
  css: "css",
  csv: "table",
  cts: "typescript",
  db: "database",
  editorconfig: "text",
  env: "text",
  "env.development": "text",
  "env.local": "text",
  "env.production": "text",
  eot: "font",
  erb: "ruby",
  fish: "bash",
  gemspec: "ruby",
  gif: "image",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  gz: "zip",
  htm: "html",
  html: "html",
  icns: "image",
  ico: "image",
  ini: "text",
  jar: "zip",
  jpeg: "image",
  jpg: "image",
  js: "javascript",
  json: "json",
  json5: "json",
  jsonc: "json",
  jsonl: "json",
  jsx: "javascript",
  ksh: "bash",
  less: "css",
  log: "text",
  markdown: "markdown",
  mcp: "mcp",
  md: "markdown",
  mdx: "markdown",
  "mdx.tsx": "markdown",
  mjs: "javascript",
  mts: "typescript",
  ods: "table",
  otf: "font",
  png: "image",
  postcss: "css",
  py: "python",
  pyi: "python",
  pyw: "python",
  pyx: "python",
  rake: "ruby",
  rar: "zip",
  rb: "ruby",
  rs: "rust",
  rst: "text",
  rtf: "text",
  sass: "css",
  scss: "css",
  sh: "bash",
  sql: "database",
  sqlite: "database",
  sqlite3: "database",
  styl: "css",
  svelte: "svelte",
  svg: "svg",
  swift: "swift",
  tar: "zip",
  tf: "terraform",
  tfstate: "terraform",
  tfvars: "terraform",
  tgz: "zip",
  tif: "image",
  tiff: "image",
  ts: "typescript",
  tsv: "table",
  tsx: "typescript",
  ttf: "font",
  txt: "text",
  vue: "vue",
  war: "zip",
  wasm: "wasm",
  wast: "wasm",
  wat: "wasm",
  webp: "image",
  woff: "font",
  woff2: "font",
  xhtml: "html",
  xls: "table",
  xlsx: "table",
  xz: "zip",
  yaml: "yml",
  yml: "yml",
  zig: "zig",
  zip: "zip",
  zsh: "bash",
}

const EXTENSION_OVERRIDES: Record<string, string> = {
  jsx: "react",
  sass: "sass",
  scss: "sass",
  tsx: "react",
}

function getExtensionCandidates(fileName: string): string[] {
  const segments = fileName.toLowerCase().split(".")
  const candidates: string[] = []
  for (let i = 1; i < segments.length; i++) {
    candidates.push(segments.slice(i).join("."))
  }
  return candidates
}

export function resolveFileIconToken(fileName: string): string {
  const lower = fileName.toLowerCase()
  const byName = FILE_NAME_TOKENS[lower]
  if (byName != null) return byName

  const extensions = getExtensionCandidates(fileName)
  for (const ext of extensions) {
    const override = EXTENSION_OVERRIDES[ext]
    if (override != null) return override
    const match = FILE_EXTENSION_TOKENS[ext]
    if (match != null) return match
  }

  return "default"
}

// -- language name → token (for code blocks that have no filename) -----------

const LANGUAGE_TOKENS: Record<string, string> = {
  bash: "bash",
  c: "default",
  "c#": "default",
  "c++": "default",
  cpp: "default",
  csharp: "default",
  css: "css",
  go: "go",
  graphql: "graphql",
  html: "html",
  java: "default",
  javascript: "javascript",
  json: "json",
  jsx: "react",
  kotlin: "default",
  markdown: "markdown",
  python: "python",
  rust: "rust",
  scss: "sass",
  sh: "bash",
  shell: "bash",
  sql: "database",
  svelte: "svelte",
  swift: "swift",
  toml: "yml",
  tsx: "react",
  typescript: "typescript",
  vue: "vue",
  wasm: "wasm",
  xml: "html",
  yaml: "yml",
  yml: "yml",
  zig: "zig",
  zsh: "bash",
}

// -- colors (from @pierre/trees, Apache 2.0) ---------------------------------

const TOKEN_COLORS: Record<string, string> = {
  astro: "light-dark(#a631be, #d568ea)",
  babel: "light-dark(#d5a910, #ffd452)",
  bash: "light-dark(#199f43, #5ecc71)",
  biome: "light-dark(#1a85d4, #69b1ff)",
  bootstrap: "light-dark(#693acf, #9d6afb)",
  browserslist: "light-dark(#d5a910, #ffd452)",
  bun: "light-dark(#594c5b, #79697b)",
  claude: "light-dark(#d47628, #ffa359)",
  css: "light-dark(#693acf, #9d6afb)",
  database: "light-dark(#a631be, #d568ea)",
  default: "light-dark(#84848a, #adadb1)",
  docker: "light-dark(#1a85d4, #69b1ff)",
  eslint: "light-dark(#693acf, #9d6afb)",
  font: "light-dark(#84848a, #adadb1)",
  git: "light-dark(#ff8c5b, #d5512f)",
  go: "light-dark(#1ca1c7, #68cdf2)",
  graphql: "light-dark(#d32a61, #ff678d)",
  html: "light-dark(#d47628, #ffa359)",
  image: "light-dark(#d32a61, #ff678d)",
  javascript: "light-dark(#d5a910, #ffd452)",
  json: "light-dark(#d47628, #ffa359)",
  markdown: "light-dark(#199f43, #5ecc71)",
  mcp: "light-dark(#17a5af, #64d1db)",
  nextjs: "light-dark(#84848a, #adadb1)",
  npm: "light-dark(#d52c36, #ff6762)",
  oxc: "light-dark(#1ca1c7, #68cdf2)",
  postcss: "light-dark(#d52c36, #ff6762)",
  prettier: "light-dark(#17a5af, #64d1db)",
  python: "light-dark(#1a85d4, #69b1ff)",
  react: "light-dark(#1ca1c7, #68cdf2)",
  ruby: "light-dark(#d52c36, #ff6762)",
  rust: "light-dark(#d47628, #ffa359)",
  sass: "light-dark(#d32a61, #ff678d)",
  stylelint: "light-dark(#693acf, #9d6afb)",
  svelte: "light-dark(#d52c36, #ff6762)",
  svg: "light-dark(#d47628, #ffa359)",
  svgo: "light-dark(#199f43, #5ecc71)",
  swift: "light-dark(#d47628, #ffa359)",
  table: "light-dark(#17a5af, #64d1db)",
  tailwind: "light-dark(#1ca1c7, #68cdf2)",
  terraform: "light-dark(#693acf, #9d6afb)",
  text: "light-dark(#84848a, #adadb1)",
  typescript: "light-dark(#1a85d4, #69b1ff)",
  vite: "light-dark(#a631be, #d568ea)",
  vscode: "light-dark(#1a85d4, #69b1ff)",
  vue: "light-dark(#199f43, #5ecc71)",
  wasm: "light-dark(#693acf, #9d6afb)",
  webpack: "light-dark(#1a85d4, #69b1ff)",
  yml: "light-dark(#d52c36, #ff6762)",
  zig: "light-dark(#d47628, #ffa359)",
  zip: "light-dark(#d47628, #ffa359)",
}

// -- components --------------------------------------------------------------

export type FileIconProps = SVGProps<SVGElement> & { fileName: string }

export function FileIcon({ fileName, style, ...props }: FileIconProps) {
  const token = resolveFileIconToken(fileName)
  const Svg = TOKEN_ICONS[token] ?? TOKEN_ICONS.default
  const color = TOKEN_COLORS[token] ?? TOKEN_COLORS.default
  return <Svg style={{ color, ...style }} {...props} />
}

export type FileIconForLanguageProps = SVGProps<SVGElement> & { language: string }

export function FileIconForLanguage({ language, style, ...props }: FileIconForLanguageProps) {
  const token = LANGUAGE_TOKENS[language.toLowerCase()] ?? "default"
  const Svg = TOKEN_ICONS[token] ?? TOKEN_ICONS.default
  const color = TOKEN_COLORS[token] ?? TOKEN_COLORS.default
  return <Svg style={{ color, ...style }} {...props} />
}
