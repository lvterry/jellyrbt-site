# Homepage: continuous botanical surface and particles

Ten Saussurea medusa studies on a dark background; lower-centered Manrope JellyRabbit wordmark. Five-second holds, four-second morphs, gentle yaw/pitch and pointer response remain.

## Rendering

- A continuous inverse-projected relief surface carries the full botanical texture during holds. Every destination pixel evaluates the same joined surface, avoiding coverage gaps between independently projected points.
- Binary foreground textures are reconstructed at 640px with tiny isolated mask holes closed. Premultiplied interpolation preserves fine hair edges without black fringes. No image is mounted in the visible DOM.
- A light-only point layer contributes a subtle shimmer during holds. During transitions the old surface fades out, particles scatter/reform with staggered phases, then the next continuous surface fades in.
- Source natural color is retained by the surface; the brighter particle palette is confined to the light overlay. Pixel density remains native up to 3× within a 3.5MP framebuffer budget.
- WebGL uses a fragment-evaluated curved relief; Canvas uses the same inverse mapping with bilinear texture reconstruction, presented through a complete-frame back buffer.
- Particle count reduced to 36,000 desktop / 24,000 mobile because continuous coverage no longer depends on point density. Pause, live reduced-motion handling, hidden-tab suspension and context restoration remain.

Validation: both particle and surface GLSL programs compiled/linked with OpenGL ES; all ten target clouds and foreground masks, layer timing, loop boundary and reduced motion checked. Visual QA on a deployed preview before publication; no physical iPhone available.
