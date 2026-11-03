# Homepage: Saussurea medusa

Dark scene, lower-centered Manrope JellyRabbit wordmark, ten generated botanical studies, 5-second hold and 4-second morph (90-second loop), gentle yaw/pitch, pointer repulsion and reduced-motion support.

## Clear particle reconstruction

- Source images remain off-screen inputs only. No raw photo or fallback image is mounted in the page.
- 640px source sampling with a small 3×3 reconstruction filter repairs isolated source pinholes before generating candidates. Deterministic spatial sampling replaces independent random placement.
- 100,000 desktop / 72,000 mobile points; smaller sharp particle cores replace the previous large soft sprites.
- Lifted shadow luminance and restrained saturation retain the ivory wool, purple florets and sage leaves.
- Both renderers use screen compositing. Foreground samples only add light and cannot stamp dark marks over neighboring fibers.
- WebGL uses an opaque dark framebuffer, explicit premultiplied screen contributions and a narrow anti-aliased edge. Canvas follows the same color, position and compositing rules.
- Native device pixel density up to 3×, bounded by a 3.5-million-pixel framebuffer budget.

Validation: syntax; all ten finite point clouds and hue coverage; 90-second wrap and transition boundaries; responsive sample counts; pause/reduced motion; mathematical monotonicity of screen blending; OpenGL ES shader compile/link. Visual review on the deployed preview precedes merge. Physical iPhone verification remains outside the available test environment.
