/* Saussurea medusa: ten generated botanical studies, sampled into colored
   point clouds. No external rendering library. WebGL and Canvas share targets. */
(async () => {
  'use strict';
  let canvas=document.getElementById('particles');
  const stage=canvas.parentElement, toggle=document.getElementById('motion-toggle');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');

  const spotlights = document.querySelector('.spotlights');
  const lettering = document.querySelector('.corner-lettering');
  const hideBeam = () => lettering.style.removeProperty('--beam-position');
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') {
      hideBeam();
      return;
    }
    lettering.style.setProperty('--beam-position', `${event.clientX}px ${event.clientY}px`);
  });
  document.documentElement.addEventListener('pointerleave', hideBeam);
  window.addEventListener('blur', hideBeam);

  let sweepTimer = 0;
  let sweepFrame = 0;
  const clearSweep = () => spotlights.style.removeProperty('--sweep-position');
  const scheduleSweep = () => {
    sweepTimer = setTimeout(startSweep, 8500 + Math.random() * 3000);
  };
  function startSweep() {
    scheduleSweep();
    const width = spotlights.clientWidth;
    const height = spotlights.clientHeight;
    let targetX = width * (0.35 + Math.random() * 0.3);
    let targetY = height * (0.35 + Math.random() * 0.3);
    if (Math.random() < 0.3) {
      const letter = lettering.children[Math.floor(Math.random() * lettering.children.length)];
      const box = letter.getBoundingClientRect();
      targetX = box.left + box.width / 2;
      targetY = box.top + box.height / 2;
    }
    const horizontal = Math.random() < 0.65;
    const extent = horizontal ? width : height;
    const slope = (Math.random() - 0.5) * 0.55;
    const reverse = Math.random() < 0.5;
    const duration = 1400 + Math.random() * 600;
    const overscan = 180;
    let start;
    function sweep(now) {
      start ??= now;
      const progress = (now - start) / duration;
      if (progress >= 1) {
        sweepFrame = 0;
        clearSweep();
        return;
      }
      const distance = (extent + 2 * overscan) * (reverse ? 1 - progress : progress) - overscan;
      const x = horizontal ? distance : targetX + (distance - targetY) * slope;
      const y = horizontal ? targetY + (distance - targetX) * slope : distance;
      spotlights.style.setProperty('--sweep-position', `${x}px ${y}px`);
      sweepFrame = requestAnimationFrame(sweep);
    }
    sweepFrame = requestAnimationFrame(sweep);
  }
  function syncSweep() {
    if (reduced.matches || document.hidden || toggle.getAttribute('aria-pressed') === 'true') {
      clearTimeout(sweepTimer);
      cancelAnimationFrame(sweepFrame);
      sweepTimer = sweepFrame = 0;
      clearSweep();
    } else if (!sweepTimer) {
      scheduleSweep();
    }
  }
  new MutationObserver(syncSweep).observe(toggle, { attributeFilter: ['aria-pressed'] });
  document.addEventListener('visibilitychange', syncSweep);
  reduced.addEventListener('change', syncSweep);
  syncSweep();

  const count=matchMedia('(max-width:600px)').matches?24000:36000;
  const TAU=Math.PI*2;
  let seed=71;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const seeds=Float32Array.from({length:count},random);
  const images=Array.from({length:10},(_,i)=>`assets/plants/medusa-${String(i+1).padStart(2,'0')}.webp`);
  function load(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Unable to load ${src}`));image.src=src;});}
  function morton(x,y){let n=0;for(let b=0;b<10;b++){n|=((x>>b)&1)<<(2*b);n|=((y>>b)&1)<<(2*b+1);}return n;}
  function sample(image){
    const size=640,off=document.createElement('canvas');off.width=off.height=size;
    const ctx=off.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,size,size);
    const pixels=ctx.getImageData(0,0,size,size).data,candidates=[],surfacePixels=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const at=(y*size+x)*4,r=pixels[at],g=pixels[at+1],b=pixels[at+2];
      // A tiny, edge-aware neighborhood reconstruction closes isolated dark
      // pinholes in the photographic source before point placement.
      let sr=0,sg=0,sb=0,weight=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=Math.max(0,Math.min(size-1,x+dx)),ny=Math.max(0,Math.min(size-1,y+dy));
        const q=(ny*size+nx)*4,w=(dx===0?2:1)*(dy===0?2:1);
        sr+=pixels[q]*w;sg+=pixels[q+1]*w;sb+=pixels[q+2]*w;weight+=w;
      }
      sr/=weight;sg/=weight;sb/=weight;
      const light=Math.max(sr,sg,sb),luminance=sr*.2126+sg*.7152+sb*.0722;
      if(light>44&&luminance>26&&pixels[at+3]>127){
        candidates.push({x,y,r:sr,g:sg,b:sb,key:morton(x,y)});
        const l=luminance/255;
        for(let c=0;c<3;c++){
          const original=[sr,sg,sb][c]/255;
          surfacePixels[at+c]=Math.round(255*Math.min(1,Math.pow(Math.max(0,l+(original-l)*1.1),.92)));
        }
        surfacePixels[at+3]=255;
      }
    }
    // Close isolated one/two-pixel mask holes; retain large natural negative spaces.
    for(let pass=0;pass<2;pass++){
      const before=surfacePixels.slice();
      for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){
        const at=(y*size+x)*4;if(before[at+3])continue;
        let n=0,r=0,g=0,b=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const p=((y+dy)*size+x+dx)*4;
          if(before[p+3]){n++;r+=before[p];g+=before[p+1];b+=before[p+2];}
        }
        if(n>=5){surfacePixels[at]=r/n;surfacePixels[at+1]=g/n;surfacePixels[at+2]=b/n;surfacePixels[at+3]=255;}
      }
    }
    if(candidates.length<1000)throw new Error('Botanical image has insufficient foreground');
    candidates.sort((a,b)=>a.key-b.key);
    const positions=new Float32Array(count*3),colors=new Float32Array(count*3),cssColors=new Array(count);
    const enhance=(c,l)=>{
      const colored=Math.max(0,l+(c-l)*1.32);
      const exposure=Math.max(.4,Math.pow(l,.8))/Math.max(l,.01);
      return Math.min(.96,colored*exposure);
    };
    for(let i=0;i<count;i++){
      const p=candidates[Math.min(candidates.length-1,Math.floor((i+.5)/count*candidates.length))],at=i*3;
      // Deterministic, even placement replaces independent random dots.
      const x=(p.x+.5)/size*2-1,y=1-(p.y+.5)/size*2;
      positions[at]=x*1.25;positions[at+1]=y*1.25;
      // A gently domed depth field adds parallax without distorting the specimen.
      const luminance=(p.r*.2126+p.g*.7152+p.b*.0722)/255;
      positions[at+2]=Math.sqrt(Math.max(0,1-x*x/.9-y*y/1.5))*.3+luminance*.055+(random()-.5)*.002;
      colors[at]=enhance(p.r/255,luminance);colors[at+1]=enhance(p.g/255,luminance);colors[at+2]=enhance(p.b/255,luminance);
      cssColors[i]=`rgb(${Math.round(colors[at]*255)},${Math.round(colors[at+1]*255)},${Math.round(colors[at+2]*255)})`;
    }
    return {positions,colors,cssColors,surfacePixels,size};
  }
  let shapes;
  try{shapes=(await Promise.all(images.map(load))).map(sample);}catch(error){console.warn(error);return;}
  const vertex=`precision highp float;
    attribute vec3 aFrom,aTo,aColorFrom,aColorTo;
    attribute float aSeed;
    uniform float uMorph,uTime,uAspect,uScale,uDpr,uPointerActive,uMotion,uOpacity;
    uniform vec2 uPointer;
    varying vec3 vColor;
    varying float vAlpha;
    void main(){
      float phase=clamp(uMorph*1.18-aSeed*.18,0.,1.);
      float m=phase*phase*(3.-2.*phase);
      vec3 p=mix(aFrom,aTo,m);
      float scatter=sin(m*3.14159265);
      p.x+=scatter*sin(aSeed*43.+uTime*.25)*.13;
      p.y+=scatter*cos(aSeed*37.+uTime*.2)*.1;
      p.z+=scatter*sin(aSeed*29.)*.25;
      p.x+=sin(uTime*.6+p.y*4.)*.0015*uMotion;
      p.y+=sin(uTime*.45)*.007*uMotion;
      float yaw=sin(uTime*.52)*.14*uMotion;
      float pitch=sin(uTime*.41+.4)*.045*uMotion;
      float rx=p.x*cos(yaw)+p.z*sin(yaw);
      float rz=-p.x*sin(yaw)+p.z*cos(yaw);
      p=vec3(rx,p.y*cos(pitch)-rz*sin(pitch),p.y*sin(pitch)+rz*cos(pitch));
      float depth=3.6/(3.6-p.z);
      vec2 screen=p.xy*uScale*depth;
      vec2 delta=screen-uPointer;
      float d=length(delta);
      float force=pow(max(0.,1.-d/.27),2.)*.14*uPointerActive*uMotion;
      screen+=delta/max(d,.002)*force;
      gl_Position=vec4(screen.x/uAspect,screen.y,0.,1.);
      gl_PointSize=clamp((1.9+aSeed*.15)*uDpr*depth,1.,7.);
      vColor=mix(aColorFrom,aColorTo,m);
      vAlpha=uOpacity;
    }`;
  const fragment=`precision mediump float;
    varying vec3 vColor; varying float vAlpha;
    void main(){
      float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
      float alpha=(1.-smoothstep(.88,1.,r))*vAlpha;
      // Brightness-normalized source colors and opaque cores avoid dark
      // fringes and density-dependent exposure while preserving fine detail.
      gl_FragColor=vec4(vColor,alpha);
    }`;

  // A full-screen inverse projection evaluates every surface pixel. It has no
  // independently projected point cells and therefore no point-coverage cracks.
  const surfaceVertex=`precision highp float;
    attribute vec2 aQuad; varying vec2 vScreen;
    void main(){vScreen=aQuad;gl_Position=vec4(aQuad,0.,1.);}`;
  const surfaceFragment=`precision highp float;
    varying vec2 vScreen;
    uniform sampler2D uTexture;
    uniform float uTime,uMotion,uAspect,uScale,uOpacity,uPointerActive;
    uniform vec2 uPointer;
    void main(){
      vec2 screen=vec2(vScreen.x*uAspect,vScreen.y);
      vec2 delta=screen-uPointer;float d=length(delta);
      screen-=delta/max(d,.002)*pow(max(0.,1.-d/.27),2.)*.035*uPointerActive*uMotion;
      vec2 q=screen/uScale;
      float yaw=sin(uTime*.52)*.14*uMotion,pitch=sin(uTime*.41+.4)*.045*uMotion;
      float cy=cos(yaw),sy=sin(yaw),cp=cos(pitch),sp=sin(pitch);
      float a=cy-q.x*sy*cp/3.6,b=q.x*sp/3.6;
      float c=sy*sp-q.y*sy*cp/3.6,e=cp+q.y*sp/3.6;
      float det=a*e-b*c;
      float z=.2;vec2 p=q;
      for(int i=0;i<4;i++){
        float bx=q.x-z*(sy+q.x*cy*cp/3.6);
        float by=q.y-z*(-cy*sp+q.y*cy*cp/3.6);
        p=vec2((bx*e-b*by)/det,(a*by-bx*c)/det);
        vec2 n=p/1.25;
        z=sqrt(max(0.,1.-n.x*n.x/.9-n.y*n.y/1.5))*.3+.025;
      }
      p.x-=sin(uTime*.6+p.y*4.)*.0015*uMotion;
      p.y-=sin(uTime*.45)*.007*uMotion;
      vec2 uv=vec2(p.x/2.5+.5,.5-p.y/2.5);
      if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;
      // RGB is premultiplied by the binary source mask before interpolation.
      vec4 color=texture2D(uTexture,uv);
      gl_FragColor=color*uOpacity;
    }`;

  let surfaceProgram,surfaceQuad,surfaceUniforms,surfaceTextures,workCanvas,workCtx,workImage;
  let gl,ctx,present,backCanvas,program,buffers,uniforms,raf=0,last=0,time=0,paused=false,lost=false,current=-1;
  let width=1,height=1,dpr=1;
  const pointer={x:0,y:0,active:0,smoothX:0,smoothY:0,strength:0};
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  function makeProgram(v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
  function setupSurface(){
    surfaceProgram=makeProgram(surfaceVertex,surfaceFragment);surfaceUniforms={};
    for(const name of ['uTime','uMotion','uAspect','uScale','uOpacity','uPointerActive','uPointer','uTexture'])surfaceUniforms[name]=gl.getUniformLocation(surfaceProgram,name);
    surfaceQuad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,surfaceQuad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    surfaceTextures=shapes.map(shape=>{
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,shape.size,shape.size,0,gl.RGBA,gl.UNSIGNED_BYTE,shape.surfacePixels);return texture;
    });
  }
  function setup(){
    gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,premultipliedAlpha:false,powerPreference:'low-power'});
    if(!gl)throw new Error('WebGL unavailable');
    program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);buffers={};
    for(const name of ['aFrom','aTo','aColorFrom','aColorTo','aSeed']){
      const b=gl.createBuffer(),at=gl.getAttribLocation(program,name);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,name==='aSeed'?1:3,gl.FLOAT,false,0,0);buffers[name]=b;
    }
    gl.bufferData(gl.ARRAY_BUFFER,seeds,gl.STATIC_DRAW);uniforms={};
    for(const name of ['uMorph','uTime','uAspect','uScale','uDpr','uPointerActive','uMotion','uOpacity','uPointer'])uniforms[name]=gl.getUniformLocation(program,name);
    setupSurface();gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(6/255,9/255,15/255,1);current=-1;lost=false;
  }
  function state(){
    // Five-second hold with continuous camera drift; four-second transition.
    const step=Math.floor(time/9)%10,t=Math.max(0,(time%9-5)/4);
    const smooth=(a,b,v)=>{const p=Math.max(0,Math.min(1,(v-a)/(b-a)));return p*p*(3-2*p);};
    const intro=reduced.matches?1:smooth(.4,1.2,time);
    const fromSurface=(1-smooth(0,.22,t))*intro,toSurface=smooth(.78,1,t)*intro;
    const pointOpacity=.025+.3*(1-fromSurface-toSurface);
    return {step,next:(step+1)%10,t,m:t*t*(3-2*t),fromSurface,toSurface,pointOpacity};
  }
  function resize(){const r=stage.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,3,Math.sqrt(3500000/(width*height)));canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(backCanvas){backCanvas.width=canvas.width;backCanvas.height=canvas.height;}if(gl&&!lost)gl.viewport(0,0,canvas.width,canvas.height);draw();}
  function drawSurface(index,opacity){
    if(opacity<=.0001)return;
    gl.useProgram(surfaceProgram);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    const at=gl.getAttribLocation(surfaceProgram,'aQuad');gl.bindBuffer(gl.ARRAY_BUFFER,surfaceQuad);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,surfaceTextures[index]);gl.uniform1i(surfaceUniforms.uTexture,0);
    gl.uniform1f(surfaceUniforms.uTime,time);gl.uniform1f(surfaceUniforms.uMotion,reduced.matches?0:1);gl.uniform1f(surfaceUniforms.uAspect,width/height);gl.uniform1f(surfaceUniforms.uScale,Math.min(.7,width/height*.75));gl.uniform1f(surfaceUniforms.uOpacity,opacity);gl.uniform1f(surfaceUniforms.uPointerActive,pointer.strength);gl.uniform2f(surfaceUniforms.uPointer,pointer.smoothX,pointer.smoothY);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  function draw(){
    if(lost)return;
    if(ctx){drawCanvas();return;}
    const {step,next,t,fromSurface,toSurface,pointOpacity}=state();
    if(current!==step){
      for(const [name,data] of [['aFrom',shapes[step].positions],['aTo',shapes[next].positions],['aColorFrom',shapes[step].colors],['aColorTo',shapes[next].colors]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}current=step;
    }
    gl.clear(gl.COLOR_BUFFER_BIT);drawSurface(step,fromSurface);drawSurface(next,toSurface);
    gl.useProgram(program);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    // Attribute locations are shared WebGL state; restore after the surface pass.
    for(const name of ['aFrom','aTo','aColorFrom','aColorTo','aSeed']){
      const at=gl.getAttribLocation(program,name);gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,name==='aSeed'?1:3,gl.FLOAT,false,0,0);
    }
    gl.uniform1f(uniforms.uOpacity,pointOpacity);gl.uniform1f(uniforms.uMorph,t);gl.uniform1f(uniforms.uTime,time);gl.uniform1f(uniforms.uAspect,width/height);gl.uniform1f(uniforms.uScale,Math.min(.7,width/height*.75));gl.uniform1f(uniforms.uDpr,dpr);gl.uniform1f(uniforms.uMotion,reduced.matches?0:1);gl.uniform2f(uniforms.uPointer,pointer.smoothX,pointer.smoothY);gl.uniform1f(uniforms.uPointerActive,pointer.strength);gl.drawArrays(gl.POINTS,0,count);
  }

  function renderSurface(index,opacity,scale,motion,cy,sy,cp,sp){
    if(opacity<=.0001)return;
    if(!workCanvas){
      workCanvas=document.createElement('canvas');workCanvas.width=workCanvas.height=640;
      workCtx=workCanvas.getContext('2d');workImage=workCtx.createImageData(640,640);
    }
    const n=workCanvas.width,out=workImage.data,shape=shapes[index],tex=shape.surfacePixels,size=shape.size;
    out.fill(0);
    const driftY=Math.sin(time*.45)*.007*motion;
    // Inverse-map every destination pixel, rather than projecting independent
    // samples. This keeps coverage complete at every yaw/pitch.
    for(let py=0;py<n;py++)for(let px=0;px<n;px++){
      let qx=((px+.5)/n*2-1)*1.45,qy=(1-(py+.5)/n*2)*1.45;
      if(pointer.strength>.001&&motion){
        const dx=qx*scale-pointer.smoothX,dy=qy*scale-pointer.smoothY,d=Math.hypot(dx,dy);
        const f=Math.max(0,1-d/.27)**2*.035*pointer.strength/Math.max(d,.002)/scale;
        qx-=dx*f;qy-=dy*f;
      }
      const a=cy-qx*sy*cp/3.6,b=qx*sp/3.6,c=sy*sp-qy*sy*cp/3.6,e=cp+qy*sp/3.6,det=a*e-b*c;
      let x=qx,y=qy,z=.2;
      for(let iteration=0;iteration<4;iteration++){
        const bx=qx-z*(sy+qx*cy*cp/3.6),by=qy-z*(-cy*sp+qy*cy*cp/3.6);
        x=(bx*e-b*by)/det;y=(a*by-bx*c)/det;
        const nx=x/1.25,ny=y/1.25;
        z=Math.sqrt(Math.max(0,1-nx*nx/.9-ny*ny/1.5))*.3+.025;
      }
      x-=Math.sin(time*.6+y*4)*.0015*motion;y-=driftY;
      const tx=(x/2.5+.5)*size-.5,ty=(.5-y/2.5)*size-.5,x0=Math.floor(tx),y0=Math.floor(ty);
      if(x0<0||y0<0||x0>=size-1||y0>=size-1)continue;
      const fx=tx-x0,fy=ty-y0,w0=(1-fx)*(1-fy),w1=fx*(1-fy),w2=(1-fx)*fy,w3=fx*fy;
      const p=(y0*size+x0)*4,p1=p+4,p2=p+size*4,p3=p2+4;
      const alpha=tex[p+3]*w0+tex[p1+3]*w1+tex[p2+3]*w2+tex[p3+3]*w3;
      if(alpha<1)continue;
      const at=(py*n+px)*4;
      // putImageData accepts straight RGBA; undo interpolation premultiplication.
      for(let channel=0;channel<3;channel++)out[at+channel]=(tex[p+channel]*w0+tex[p1+channel]*w1+tex[p2+channel]*w2+tex[p3+channel]*w3)*255/alpha;
      out[at+3]=alpha*opacity;
    }
    workCtx.putImageData(workImage,0,0);
    const extent=2.9*scale*height/2;
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.drawImage(workCanvas,width/2-extent/2,height/2-extent/2,extent,extent);
  }
  function drawCanvas(){
    const {step,next,t,fromSurface,toSurface,pointOpacity}=state(),a=shapes[step],b=shapes[next];
    const scale=Math.min(.7,width/height*.75),motion=reduced.matches?0:1;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='#06090f';ctx.fillRect(0,0,width,height);
    const yaw=Math.sin(time*.52)*.14*motion,pitch=Math.sin(time*.41+.4)*.045*motion;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    renderSurface(step,fromSurface,scale,motion,cy,sy,cp,sp);renderSurface(next,toSurface,scale,motion,cy,sy,cp,sp);
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=pointOpacity;
    for(let i=0;i<count;i++){
      const at=i*3,s=seeds[i],phase=Math.max(0,Math.min(1,t*1.18-s*.18)),m=phase*phase*(3-2*phase),scatter=Math.sin(m*Math.PI);
      let x=a.positions[at]*(1-m)+b.positions[at]*m+scatter*Math.sin(s*43+time*.25)*.13;
      let y=a.positions[at+1]*(1-m)+b.positions[at+1]*m+scatter*Math.cos(s*37+time*.2)*.1;
      let z=a.positions[at+2]*(1-m)+b.positions[at+2]*m+scatter*Math.sin(s*29)*.25;
      x+=Math.sin(time*.6+y*4)*.0015*motion;y+=Math.sin(time*.45)*.007*motion;
      const rx=x*cy+z*sy,rz=-x*sy+z*cy;z=y*sp+rz*cp;y=y*cp-rz*sp;x=rx;
      const depth=3.6/(3.6-z);x*=scale*depth;y*=scale*depth;
      const dx=x-pointer.smoothX,dy=y-pointer.smoothY,d=Math.hypot(dx,dy),f=Math.max(0,1-d/.27)**2*.14*pointer.strength*motion/Math.max(d,.002);x+=dx*f;y+=dy*f;
      if(m===0){ctx.fillStyle=a.cssColors[i];}else{
        const r=Math.round((a.colors[at]*(1-m)+b.colors[at]*m)*255),g=Math.round((a.colors[at+1]*(1-m)+b.colors[at+1]*m)*255),bl=Math.round((a.colors[at+2]*(1-m)+b.colors[at+2]*m)*255);
        ctx.fillStyle=`rgb(${r},${g},${bl})`;
      }
      const px=width/2+x*height/2,py=height/2-y*height/2,size=(1.85+s*.1)*depth;ctx.fillRect(px-size/2,py-size/2,size,size);
    }
    present.drawImage(backCanvas,0,0);
  }
  function frame(now){raf=0;if(last)time+=Math.min((now-last)/1000,.2);last=now;pointer.smoothX+=(pointer.x-pointer.smoothX)*.12;pointer.smoothY+=(pointer.y-pointer.smoothY)*.12;pointer.strength+=(pointer.active-pointer.strength)*.09;draw();if(!paused&&!reduced.matches&&!document.hidden&&!lost)raf=requestAnimationFrame(frame);}
  function sync(){cancelAnimationFrame(raf);raf=0;last=0;toggle.setAttribute('aria-label',paused?'Resume motion':'Pause motion');toggle.setAttribute('aria-pressed',String(paused));toggle.hidden=reduced.matches||lost;if(!paused&&!reduced.matches&&!document.hidden&&!lost)raf=requestAnimationFrame(frame);else draw();}
  toggle.addEventListener('click',()=>{paused=!paused;sync();});
  stage.addEventListener('pointermove',e=>{if(reduced.matches)return;const r=stage.getBoundingClientRect();pointer.x=((e.clientX-r.left)/width*2-1)*width/height;pointer.y=1-(e.clientY-r.top)/height*2;pointer.active=1;});
  for(const name of ['pointerleave','pointercancel','pointerup'])stage.addEventListener(name,()=>{pointer.active=0;});
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',()=>{if(reduced.matches){time=0;pointer.active=pointer.strength=0;}sync();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;document.documentElement.classList.remove('webgl-ready');sync();});
  canvas.addEventListener('webglcontextrestored',()=>{try{setup();resize();document.documentElement.classList.add('webgl-ready');sync();}catch{document.documentElement.classList.remove('webgl-ready');}});
  try{setup();}catch(error){console.warn('Using Canvas compatibility renderer:',error.message);const replacement=canvas.cloneNode();canvas.replaceWith(replacement);canvas=replacement;gl=null;present=canvas.getContext('2d',{alpha:false});backCanvas=document.createElement('canvas');ctx=backCanvas.getContext('2d',{alpha:false});if(!ctx||!present)return;}
  document.documentElement.classList.add('webgl-ready');toggle.hidden=false;new ResizeObserver(resize).observe(stage);resize();sync();
})();
