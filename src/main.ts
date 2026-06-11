import { GardenApp } from "./engine/app";
import { buildTestGarden } from "./level/testGarden";

const container = document.getElementById("app")!;
const app = new GardenApp(container, buildTestGarden());

// Dev convenience: reachable from the console for inspection and headless stepping.
(window as Window & { garden?: GardenApp }).garden = app;
