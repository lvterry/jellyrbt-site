# Homepage: Saussurea medusa

Dark background, lower-centered Manrope JellyRabbit wordmark, ten botanical studies, 5-second hold / 4-second morph (90-second loop), gentle camera yaw/pitch, pointer repulsion and reduced-motion support.

## Clear particle reconstruction

- Source images are off-screen sampling inputs; no image is displayed in the page.
- Uniform 640px spatial sampling replaces independently jittered dots. A tiny 3×3 weighted neighborhood filter reconstructs isolated source pinholes.
- 100,000 desktop / 72,000 mobile points, coherent motion at rest and opaque narrow-edge cores provide continuous coverage without the previous random black gaps.
- Shadow exposure has a controlled floor; saturation remains restrained. Dark photographic speckles are not reproduced as near-black particles.
- Both renderers use normalized source colors and source-over compositing rather than density-dependent additive exposure, retaining wool detail and flower/leaf hues.
- WebGL uses an opaque dark framebuffer and tightly anti-aliased particle edges. The Canvas fallback renders into an off-screen back buffer and presents only complete frames, preventing partial-row artifacts.
- Native device pixel density up to 3×, within a 3.5-million-pixel framebuffer budget. CSS/JS cache version: medusa-3e.

Validation: syntax; all ten point clouds, color coverage, 90-second wrap, transition boundaries, mobile sample count and 3× DPR, pause/reduced motion; OpenGL ES shader compile/link. Deployed preview visually checked at desktop and 390px iframe widths. Temporary QA page removed before publication. No physical iPhone was available for testing.
