# Homepage: Saussurea medusa

- Dark full-screen composition with lower-centered Manrope JellyRabbit wordmark.
- Ten AI-generated botanical reconstructions of Saussurea medusa, varying growth habit, flower stage and viewpoint. No jellyfish or rabbit targets remain. Source images and exact prompts: assets/plants/.
- Ivory/silver wool, muted sage foliage and purple florets are sampled directly from each image into 26,000 colored points (14,000 below 600px). Spatial Morton ordering keeps nearby points coherent during transitions. Shallow relief preserves photographic structure.
- Each plant holds for 6 seconds, morphs for 5 seconds, then advances. Ten-target loop lasts 110 seconds; final specimen returns to first. Local smoothed pointer repulsion is retained.
- Native WebGL shaders, Canvas 2D compatibility, static botanical fallback, pause/resume, live reduced-motion handling, hidden-tab suspension and DPR cap of 2. No external rendering dependency.
- Ten optimized WebP source assets total about 686 KB. Cache-versioned CSS and JS prevent old animal-target assets being reused with new markup.

Validation: JavaScript syntax; all ten distinct target clouds with finite positions and green/purple color coverage; full loop and transition boundary checks; attribute-buffer wiring; pause/resume and reduced-motion behavior. OpenGL ES vertex and fragment shaders compiled and linked using Mesa EGL. Browser visually checked Canvas rendering and pause control at desktop and 390px iframe widths. Physical-device GPU performance was not measured.
