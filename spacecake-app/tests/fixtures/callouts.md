# callouts fixture

visual test file for callouts. each canonical type + alias + edge case.

## canonical types (all 13)

> [!note]
> default note callout, no title.

> [!abstract]
> a summary block.

> [!info]
> informational content.

> [!todo]
> things to do.

> [!tip]
> a helpful tip.

> [!success]
> operation completed.

> [!question]
> have you considered this?

> [!warning]
> proceed with care.

> [!failure]
> something went wrong.

> [!danger]
> this will break things.

> [!bug]
> known issue tracked here.

> [!example]
> here is an example.

> [!quote]
> "the best way to predict the future is to invent it." — alan kay

## custom titles

> [!note] a custom title
> the header should read "a custom title" instead of "note".

> [!warning] watch out!
> custom title with an exclamation mark.

## aliases (should render as canonical type)

> [!summary]
> alias of abstract — should render as abstract (cyan, clipboard icon).

> [!tldr]
> another alias of abstract.

> [!hint]
> alias of tip.

> [!important]
> alias of tip.

> [!check]
> alias of success.

> [!done]
> alias of success.

> [!help]
> alias of question.

> [!faq]
> alias of question.

> [!caution]
> alias of warning.

> [!attention]
> alias of warning.

> [!fail]
> alias of failure.

> [!missing]
> alias of failure.

> [!error]
> alias of danger.

> [!cite]
> alias of quote.

## case-insensitive

> [!NOTE]
> uppercase type name.

> [!Warning] Mixed Case Title
> mixed-case type with a custom title.

## unknown type (falls back to note styling)

> [!xyzzy]
> unknown type should render with note color and icon.

## foldable variants

> [!tip]+
> foldable, expanded by default. click the chevron to collapse.

> [!warning]-
> foldable, collapsed by default. click to expand.

> [!info]+ collapsible with title
> foldable expanded variant with a custom title.

## rich body content

> [!example] with a list
> here are some items:
>
> - first item
> - second item
> - third item

> [!tip] with inline formatting
> supports **bold**, _italic_, `inline code`, and [links](https://example.com).

> [!info] with a code block
>
> ```ts
> function greet(name: string): string {
>   return `hello, ${name}`
> }
> ```

## nested callouts

> [!question] can callouts be nested?
>
> > [!success] yes, they can.
> > and you can nest further if you need to.

## edge cases

> [!note]

> [!note] empty body with title only.

an ordinary paragraph follows — should not be absorbed into the callout above.

> [!warning]
> a multi-line callout
> that continues for several
> lines of blockquote body content
> to verify the parser collects them all.

continuing paragraph outside the callout.
