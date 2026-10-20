# Third-party notices

Atlas source content and audio retain their original ownership and terms. The root Atlas project has no source-code license file; this port does not infer or grant redistribution rights for the original game assets. `assets/atlas/audio-provenance.json` records the original audio paths and SHA-256 hashes.

The production JAR includes these unmodified libraries as nested JARs, with their original notices retained:

- Fabric API 0.116.17+1.21.1, Apache License 2.0: https://github.com/FabricMC/fabric
- Rhino 1.7.15, Mozilla Public License 2.0: https://github.com/mozilla/rhino

Fabric Loader and Minecraft are separately required. Minecraft is not distributed by this project. Build tooling includes Gradle, Fabric Loom, esbuild, Babel, canvas bindings, and Three.js; those build dependencies retain their package licenses and are not bundled as runtime JavaScript dependencies.
