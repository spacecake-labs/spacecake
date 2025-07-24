// import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
// import { CodeNode } from "@lexical/code";
// import { useEffect, useState } from "react";
// import { createRoot } from "react-dom/client";
// import {
//   getCodeMetadata,
//   setCodeMetadata,
// } from "@/components/editor/nodes/code-state";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";

// export function CodeToolbarPlugin(): null {
//   const [editor] = useLexicalComposerContext();
//   const [roots, setRoots] = useState<Map<string, any>>(new Map());

//   useEffect(() => {
//     const unregisterTransform = editor.registerNodeTransform(
//       CodeNode,
//       (node) => {
//         const dom = editor.getElementByKey(node.getKey());
//         if (!dom) return;

//         const nodeKey = node.getKey();

//         // Check if we already have a root for this node
//         if (roots.has(nodeKey)) {
//           const root = roots.get(nodeKey);
//           root.render(<CodeToolbar nodeKey={nodeKey} editor={editor} />);
//           return;
//         }

//         console.log("Creating toolbar for node:", nodeKey);

//         // Create toolbar only once
//         let toolbar = dom.previousElementSibling;
//         if (!toolbar?.classList.contains("code-toolbar")) {
//           toolbar = document.createElement("div");
//           toolbar.className = "code-toolbar";
//           toolbar.style.border = "2px solid red";
//           dom.parentNode?.insertBefore(toolbar, dom);
//           console.log("Created new toolbar");

//           const root = createRoot(toolbar);
//           setRoots((prev) => new Map(prev).set(nodeKey, root));

//           // Render immediately after creating
//           root.render(<CodeToolbar nodeKey={nodeKey} editor={editor} />);
//         }
//       }
//     );

//     return unregisterTransform;
//   }, [editor, roots]);

//   return null;
// }

// function CodeToolbar({ nodeKey, editor }: { nodeKey: string; editor: any }) {
//   console.log("CodeToolbar component rendering for:", nodeKey); // Debug log
//   const [metadata, setMetadata] = useState({
//     language: "",
//     block: "",
//     theme: "",
//   });

//   useEffect(() => {
//     // Read metadata within editor context
//     editor.getEditorState().read(() => {
//       const node = editor.getEditorState()._nodeMap.get(nodeKey);
//       if (node instanceof CodeNode) {
//         const nodeMetadata = getCodeMetadata(node);
//         setMetadata(nodeMetadata);
//       }
//     });
//   }, [editor, nodeKey]);

//   const updateLanguage = (language: string) => {
//     editor.update(() => {
//       const node = editor.getEditorState()._nodeMap.get(nodeKey);
//       if (node instanceof CodeNode) {
//         setCodeMetadata(node, { language });
//         node.setLanguage(language);
//       }
//     });
//   };

//   const updateTheme = (theme: string) => {
//     editor.update(() => {
//       const node = editor.getEditorState()._nodeMap.get(nodeKey);
//       if (node instanceof CodeNode) {
//         setCodeMetadata(node, { theme });
//       }
//     });
//   };

//   return (
//     <div className="flex items-center justify-between p-2 bg-red-500 border border-border rounded-t-md">
//       <div>TOOLBAR TEST - {nodeKey}</div>
//       <div className="flex items-center gap-2">
//         <Badge variant="secondary">{metadata.language || "text"}</Badge>
//         {metadata.block && <Badge variant="outline">{metadata.block}</Badge>}
//       </div>

//       <div className="flex items-center gap-2">
//         <Select
//           value={metadata.language || "text"}
//           onValueChange={updateLanguage}
//         >
//           <SelectTrigger className="w-24">
//             <SelectValue />
//           </SelectTrigger>
//           <SelectContent>
//             <SelectItem value="javascript">JavaScript</SelectItem>
//             <SelectItem value="typescript">TypeScript</SelectItem>
//             <SelectItem value="python">Python</SelectItem>
//             <SelectItem value="text">Text</SelectItem>
//           </SelectContent>
//         </Select>

//         <Select value={metadata.theme || "default"} onValueChange={updateTheme}>
//           <SelectTrigger className="w-32">
//             <SelectValue />
//           </SelectTrigger>
//           <SelectContent>
//             <SelectItem value="github-dark-default">GitHub Dark</SelectItem>
//             <SelectItem value="github-light-default">GitHub Light</SelectItem>
//             <SelectItem value="default">Default</SelectItem>
//           </SelectContent>
//         </Select>
//       </div>
//     </div>
//   );
// }
