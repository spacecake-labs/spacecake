import { createStore } from "jotai"

/**
 * A global Jotai store that can be shared between the React component tree
 * and other modules or services operating outside of React.
 */
export const store = createStore()
