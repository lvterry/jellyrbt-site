# Homepage: particle metamorphosis

- Dark, full-screen composition. Only JellyRabbit remains as visible copy, set in Manrope (Google Fonts) in the lower center.
- Dependency-free WebGL point sprites: 16,000 particles on desktop, 8,500 on mobile. Shape sampling happens once; shader handles morphing, light, drift and local pointer repulsion.
- Ten targets alternate J1 → R1 → J2 → R2 → J3 → R3 → J4 → R4 → J5 → R5 → J1. Each has a 3-second hold and a 5-second transition (80-second loop).
- Jellyfish: umbrella, moon, tall bell, crown, swept bell. Rabbits: seated, crouched, curious, lop-eared, reaching. Three-dimensional sampled surfaces.
- Pointer force is local, softened and smoothed. Pause control, reduced-motion support, hidden-tab suspension and DPR cap of 2.
- Canvas 2D compatibility renderer retains all ten forms and interactions without WebGL. Static SVG remains for unavailable scripting/rendering contexts.
- Existing domain, favicon and remaining assets are retained. Supersedes the previous animated-logo homepage.

Validation: JavaScript syntax check; geometry checks for ten distinct finite equal-size point clouds; browser inspection of Canvas rendering, Manrope loading and page overflow. WebGL unavailable in the QA browser, so GPU rendering needs verification on a WebGL-enabled device.
