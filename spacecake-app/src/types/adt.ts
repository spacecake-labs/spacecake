export type Left<A> = { _tag: "Left"; value: A }
export type Right<B> = { _tag: "Right"; value: B }

export type Either<A, B> = Left<A> | Right<B>

export const left = <A, B>(value: A): Either<A, B> => ({ _tag: "Left", value })
export const right = <A, B>(value: B): Either<A, B> => ({
  _tag: "Right",
  value,
})

export const match = <A, B, C, D>(
  either: Either<A, B>,
  handlers: {
    onLeft: (a: A) => C
    onRight: (b: B) => D
  }
): C | D => {
  return either._tag === "Left"
    ? handlers.onLeft(either.value)
    : handlers.onRight(either.value)
}
