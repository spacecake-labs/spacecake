# Wikilink Test Fixture

## Basic Links

A simple wikilink: [[wikilink-target]]

A wikilink with display text: [[wikilink-target|click here for the target]]

## Anchor Links

Link to a heading: [[wikilink-target#features]]

Link to a block: [[wikilink-target#^important-note]]

Same-file heading link: [[#broken-links]]

## Broken Links

A link to a file that does not exist: [[nonexistent-file]]

## Markdown Links

### basic internal links

- relative: [link to target](./wikilink-target.md)
- bare filename: [target](wikilink-target.md)
- another fixture: [mermaid diagram](mermaid.md)
- table fixture: [table](./table.md)

### with anchors

- heading in another file: [features section](./wikilink-target.md#features)
- details heading: [details](wikilink-target.md#details)
- same-file heading: [broken links](#broken-links)
- same-file heading: [basic links](#basic-links)
- block reference: [important note](./wikilink-target.md#^important-note)

### external links (should open in browser)

- [example.com](https://example.com)
- [send email](mailto:user@example.com)

### broken internal links

- [does not exist](./nonexistent-file.md)
- [also missing](../no-such-dir/file.md)

## Mixed Content

Here is a regular markdown link: [example](https://example.com)

Here is a wikilink next to bold text: **important** [[wikilink-target]]

Embed syntax should NOT become a wikilink: ![[wikilink-target]]

Multiple wikilinks in one line: [[wikilink-target]] and [[table]]
