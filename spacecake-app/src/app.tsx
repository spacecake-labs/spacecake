import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { useTheme } from "@/components/theme-provider";

// Create a new router instance with hash routing
const memoryHistory = createMemoryHistory({
  initialEntries: ["/"], // Pass your initial url
});

const router = createRouter({ routeTree, history: memoryHistory });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);
function RootWithTheme() {
  const { theme } = useTheme();
  // set class on body; tailwind v4 supports .dark variants via :root class as well,
  // but body works given our globals.css @custom-variant
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  return <RouterProvider router={router} />;
}

root.render(
  <StrictMode>
    <RootWithTheme />
  </StrictMode>
);
