import { Facet, RangeSet, StateField, type Extension } from "@codemirror/state"
import { EditorView, gutter, GutterMarker } from "@codemirror/view"

import type { LineDiff } from "@/lib/atoms/git"

// -- facet to pass diff data into the extension --

export const diffGutterFacet = Facet.define<LineDiff[], LineDiff[]>({
  combine: (values) => values[0] ?? [],
})

// -- gutter markers --

class AddedMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div")
    el.className = "cm-diff-gutter-added"
    return el
  }
}

class ModifiedMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div")
    el.className = "cm-diff-gutter-modified"
    return el
  }
}

class DeletedMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div")
    el.className = "cm-diff-gutter-deleted"
    return el
  }
}

const addedMarker = new AddedMarker()
const modifiedMarker = new ModifiedMarker()
const deletedMarker = new DeletedMarker()

// -- state field caches the range set, only recomputed when facet changes --

function buildRangeSet(
  diffs: LineDiff[],
  docLines: number,
  lineAt: (n: number) => { from: number },
): RangeSet<GutterMarker> {
  if (!diffs.length) return RangeSet.empty

  const ranges: Array<ReturnType<GutterMarker["range"]>> = []
  for (const diff of diffs) {
    const marker =
      diff.type === "added"
        ? addedMarker
        : diff.type === "modified"
          ? modifiedMarker
          : deletedMarker
    for (let line = diff.startLine; line <= diff.endLine; line++) {
      if (line >= 1 && line <= docLines) {
        ranges.push(marker.range(lineAt(line).from))
      }
    }
  }

  ranges.sort((a, b) => a.from - b.from)
  return RangeSet.of(ranges)
}

const diffGutterField = StateField.define<RangeSet<GutterMarker>>({
  create(state) {
    const diffs = state.facet(diffGutterFacet)
    return buildRangeSet(diffs, state.doc.lines, (n) => state.doc.line(n))
  },
  update(prev, tr) {
    // only rebuild when the facet value changes
    if (!tr.startState.facet(diffGutterFacet).length && !tr.state.facet(diffGutterFacet).length) {
      return prev
    }
    if (
      tr.startState.facet(diffGutterFacet) === tr.state.facet(diffGutterFacet) &&
      !tr.docChanged
    ) {
      return prev
    }
    const diffs = tr.state.facet(diffGutterFacet)
    return buildRangeSet(diffs, tr.state.doc.lines, (n) => tr.state.doc.line(n))
  },
})

// -- gutter reads from the cached state field --

const diffGutterExtension = gutter({
  class: "cm-diff-gutter",
  markers: (view) => view.state.field(diffGutterField),
})

// -- theme --

const diffGutterTheme = EditorView.baseTheme({
  ".cm-diff-gutter": {
    width: "3px",
    marginRight: "2px",
  },
  ".cm-diff-gutter-added": {
    width: "3px",
    height: "100%",
    backgroundColor: "#2ea04370",
  },
  ".cm-diff-gutter-modified": {
    width: "3px",
    height: "100%",
    backgroundColor: "#d29922",
  },
  ".cm-diff-gutter-deleted": {
    width: "3px",
    height: "100%",
    backgroundColor: "#f85149",
    clipPath: "polygon(0 40%, 100% 50%, 0 60%)",
  },
})

// -- static extensions (installed once, outside the compartment) --

export const diffGutterStaticExtensions: Extension = [
  diffGutterField,
  diffGutterExtension,
  diffGutterTheme,
]

// -- compartment-friendly data-only configurators --

export const diffGutterData = (diffs: LineDiff[]): Extension => diffGutterFacet.of(diffs)

export const emptyDiffGutterData = (): Extension => diffGutterFacet.of([])
