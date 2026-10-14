import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActionProvider } from "./components/ui";
import "./fonts.css";

const query = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: true },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={query}>
      <ActionProvider>
        <App />
      </ActionProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
