import React from "react";
import { useCodeBlockEditorContext } from "@/components/editor/nodes/code-node";
import { atom } from "jotai";
import type { Block } from "@/types/parser";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { languages } from "@codemirror/language-data";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { useTheme } from "@/components/theme-provider";
import { useCodeMirrorRef } from "@/components/editor/plugins/use-codemirror-ref";
import { CodeBlock } from "@/components/code-block";
import { blockId } from "@/lib/parser/block-id";
import { debounce } from "@/lib/utils";

// jotai atoms for state management
export const codeBlockLanguagesAtom = atom<Record<string, string>>({
  js: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript (React)",
  jsx: "JavaScript (React)",
  //   css: "CSS",
  //   html: "HTML",
  //   json: "JSON",
  //   md: "Markdown",
  py: "Python",
  //   java: "Java",
  //   cpp: "C++",
  //   c: "C",
  //   go: "Go",
  //   rs: "Rust",
  //   php: "PHP",
  //   rb: "Ruby",
  //   sql: "SQL",
});

export const codeMirrorExtensionsAtom = atom<Extension[]>([]);
export const codeMirrorAutoLoadLanguageSupportAtom = atom<boolean>(true);
export const readOnlyAtom = atom<boolean>(false);

interface CodeMirrorEditorProps {
  language: string;
  nodeKey: string;
  code: string;
  block: Block;
  focusEmitter?: {
    publish: () => void;
    subscribe: (cb: () => void) => void;
  };
}

const EMPTY_VALUE = "__EMPTY_VALUE__";

// Function to get language support extension dynamically
const getLanguageSupport = async (
  language: string
): Promise<Extension | null> => {
  if (!language || language === EMPTY_VALUE) return null;

  const languageData = languages.find((l) => {
    return (
      l.name === language ||
      l.alias.includes(language) ||
      l.extensions.includes(language)
    );
  });

  if (languageData) {
    try {
      const languageSupport = await languageData.load();
      return languageSupport.extension;
    } catch {
      console.warn("failed to load language support for", language);
      return null;
    }
  }

  return null;
};

const focusedActiveLineTheme = EditorView.theme({
  // make gutter transparent by when not focused
  "&:not(.cm-focused) .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  // make active line transparent by when not focused
  "&:not(.cm-focused) .cm-activeLine": {
    backgroundColor: "transparent",
  },
});

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  language,
  nodeKey,
  code,
  block,
  focusEmitter,
}) => {
  const { setCode } = useCodeBlockEditorContext();

  // Use block info
  const blockKind = String(block.kind);
  const blockName = block.name.value;

  // Use hardcoded values instead of atoms to avoid re-renders
  const readOnly = false;
  const codeMirrorExtensions: Extension[] = [];
  const autoLoadLanguageSupport = true;

  const editorViewRef = React.useRef<EditorView | null>(null);
  const elRef = React.useRef<HTMLDivElement | null>(null);

  const setCodeRef = React.useRef(setCode);
  setCodeRef.current = setCode;

  // Use the focus management hook
  const codeMirrorRef = useCodeMirrorRef(
    nodeKey,
    "codeblock",
    language,
    focusEmitter || { subscribe: () => {}, publish: () => {} }
  );

  codeMirrorRef.current = {
    getCodemirror: () => editorViewRef.current!,
  };

  const { theme } = useTheme();

  // debounce settings and helpers
  const debounceMs = 250;
  const debouncedCommitRef = React.useRef(
    debounce(() => {
      const view = editorViewRef.current;
      if (view) {
        const latest = view.state.doc.toString();
        setCodeRef.current(latest);
      }
    }, debounceMs)
  );
  const flushPending = React.useCallback(() => {
    debouncedCommitRef.current.flush();
  }, []);

  React.useEffect(() => {
    const el = elRef.current!;
    void (async () => {
      // Load language support first
      let languageSupport = null;
      if (language !== "" && autoLoadLanguageSupport) {
        languageSupport = await getLanguageSupport(language);
      }

      const startLine = Math.max(1, Number(block.startLine) || 1);

      const extensions = [
        ...codeMirrorExtensions,
        basicSetup,
        lineNumbers({
          formatNumber: (lineNo) => String(lineNo + startLine - 1),
        }),
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        theme === "dark" ? githubDark : githubLight,
        focusedActiveLineTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            debouncedCommitRef.current.schedule();
          }
        }),
      ];

      // Add language support if available
      if (languageSupport) {
        extensions.push(languageSupport);
      }

      if (readOnly) {
        extensions.push(EditorState.readOnly.of(true));
      }

      el.innerHTML = "";
      editorViewRef.current = new EditorView({
        parent: el,
        state: EditorState.create({ doc: code, extensions }),
      });

      const view = editorViewRef.current;

      const onKeyDown = (ev: KeyboardEvent) => {
        // prevent lexical from handling keystrokes while in codemirror
        ev.stopPropagation();
        // flush on save shortcuts
        const isSaveKey =
          (ev.key === "s" || ev.key === "S") && (ev.metaKey || ev.ctrlKey);
        if (isSaveKey) {
          ev.preventDefault();
          flushPending();
          // let window keydown handler trigger save if not inside cm-editor
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "s",
              metaKey: ev.metaKey,
              ctrlKey: ev.ctrlKey,
            })
          );
        }
      };

      const onBlur = () => {
        // only flush pending changes; do not trigger save on blur
        flushPending();
      };

      view.contentDOM.addEventListener("keydown", onKeyDown);
      view.contentDOM.addEventListener("blur", onBlur, true);
    })();

    return () => {
      // ensure any pending changes are committed before teardown
      flushPending();
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
      // listeners are attached to contentDOM; they are removed by destroy()
    };
  }, [language, theme, debounceMs, flushPending]);

  return (
    <CodeBlock
      code={code}
      language={language}
      blockName={blockKind}
      title={blockName}
      editable={!readOnly}
      showLineNumbers={true}
      theme="dark"
      dataBlockId={blockId(block)}
      onCodeChange={(newCode) => {
        setCodeRef.current(newCode);
      }}
    >
      <div ref={elRef} />
    </CodeBlock>
  );
};

// no-op legacy handler removed in favor of onKeyDown above
