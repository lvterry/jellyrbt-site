# Homepage: Saussurea medusa

- Dark full-screen composition with lower-centered Manrope JellyRabbit wordmark.
- Ten AI-generated botanical reconstructions of Saussurea medusa, varying growth habit, flower stage and viewpoint. No jellyfish or rabbit targets remain. Source images and exact prompts: assets/plants/.
- Ivory/silver wool, muted sage foliage and purple florets are sampled directly from each image into 46,000 colored points (26,000 below 600px). Spatial Morton ordering keeps nearby points coherent during transitions. A domed relief and continuous ±8° yaw / ±2.6° pitch provide parallax without a full turn that would expose the image-based geometry. Saturation 1.55 and gamma lift improve plant/flower separation.
- Each plant holds for 5 seconds, morphs for 4 seconds, then advances. Ten-target loop lasts 90 seconds; final specimen returns to first. Local smoothed pointer repulsion is retained.
- Native WebGL shaders, Canvas 2D compatibility, pause/resume, live reduced-motion handling, hidden-tab suspension and DPR cap of 2. No external rendering dependency.
- Ten optimized WebP source assets total about 686 KB. Cache-versioned CSS and JS prevent stale assets being reused. No source image is mounted in the visible DOM: loading and renderer failure leave only the dark scene and wordmark, avoiding the raw-photo flash. Source images are decoded off-screen solely for particle sampling.

Validation: JavaScript syntax; all ten distinct target clouds with finite positions and green/purple color coverage; full loop and transition boundary checks; attribute-buffer wiring; pause/resume and reduced-motion behavior. OpenGL ES vertex and fragment shaders compiled and linked using Mesa EGL. Browser visually checked Canvas rendering and pause control at desktop and 390px iframe widths. Physical-device GPU performance was not measured.

Refinement validation: no image element in the page; all ten 46,000-point targets, 90-second wrap and transition boundaries checked; revised GLSL compiled and linked using Mesa EGL. Canvas uses precomputed enhanced colors during the hold to avoid repeated color conversion per frame.
