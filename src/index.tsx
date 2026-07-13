import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const params = new URLSearchParams(window.location.search);
const performanceMode = import.meta.env.DEV && params.get("perf") === "1";
const performanceVariant = params.get("variant") === "baseline" ? "baseline" : "stage1";

const renderApplication = async () => {
  if (performanceMode && performanceVariant === "baseline") {
    (globalThis as typeof globalThis & { __ATLAS_LEGACY_COLUMNS__?: boolean }).__ATLAS_LEGACY_COLUMNS__ = true;
  }

  const { installStreamingSafety } = await import("./systems/performance/streamingSafety");
  installStreamingSafety({ enforce: !performanceMode || performanceVariant !== "baseline" });

  if (!performanceMode || performanceVariant !== "baseline") {
    const { installSectionRuntime } = await import("./systems/world/sections/sectionRuntime");
    installSectionRuntime();
  }

  if (performanceMode) {
    const { PerformanceHarness } = await import("./perf/PerformanceHarness");
    root.render(<PerformanceHarness />);
    return;
  }

  const { default: App } = await import("./App");
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

void renderApplication();
