import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const performanceMode =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("perf") === "1";

const renderApplication = async () => {
  if (performanceMode) {
    const { PerformanceHarness } = await import("./perf/PerformanceHarness");
    root.render(<PerformanceHarness />);
    return;
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

void renderApplication();
