import React from "react";
import { useCodeBlockEditorContext } from "@/components/editor/nodes/code-node";
import { atom } from "jotai";
import type { Block } from "@/types/parser";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { languages } from "@codemirror/language-data";
import { githubLight } from "@uiw/codemirror-theme-github";
import { useCodeMirrorRef } from "@/components/editor/plugins/use-codemirror-ref";
import { CodeBlock } from "@/components/code-block";

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
  // make active line transparent by default (when not focused)
  ".cm-activeLine": {
    backgroundColor: "transparent !important",
  },
  // only show active line highlighting when the editor is focused
  "&.cm-focused .cm-activeLine": {
    backgroundColor: "var(--muted) !important",
  },
  // make gutter transparent by default (when not focused)
  ".cm-activeLineGutter": {
    backgroundColor: "transparent !important",
  },
  // highlight gutter when focused
  "&.cm-focused .cm-activeLineGutter": {
    backgroundColor: "var(--muted) !important",
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

  React.useEffect(() => {
    const el = elRef.current!;
    void (async () => {
      // Load language support first
      let languageSupport = null;
      if (language !== "" && autoLoadLanguageSupport) {
        languageSupport = await getLanguageSupport(language);
      }

      const extensions = [
        ...codeMirrorExtensions,
        basicSetup,
        lineNumbers(),
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        githubLight,
        focusedActiveLineTheme,
        EditorView.updateListener.of(({ state }) => {
          const newCode = state.doc.toString();
          setCodeRef.current(newCode);
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

      el.addEventListener("keydown", stopPropagationHandler);
    })();

    return () => {
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
      el.removeEventListener("keydown", stopPropagationHandler);
    };
  }, [language]);

  return (
    <CodeBlock
      code={code}
      language={language}
      blockName={blockName}
      title={blockKind}
      editable={!readOnly}
      showLineNumbers={true}
      theme="dark"
      onCodeChange={(newCode) => {
        setCodeRef.current(newCode);
      }}
    >
      <div ref={elRef} />
    </CodeBlock>
  );
};

function stopPropagationHandler(this: HTMLDivElement, ev: KeyboardEvent) {
  ev.stopPropagation();
}
