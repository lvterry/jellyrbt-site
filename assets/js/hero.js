/* Saussurea medusa: ten generated botanical studies, sampled into colored
   point clouds. No external rendering library. WebGL and Canvas share targets. */
(async () => {
  'use strict';
  let canvas=document.getElementById('particles');
  const stage=canvas.parentElement, toggle=document.getElementById('motion-toggle');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const count=matchMedia('(max-width:600px)').matches?72000:100000;
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
    const pixels=ctx.getImageData(0,0,size,size).data,candidates=[];
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
      if(light>44&&luminance>26&&pixels[at+3]>127)candidates.push({x,y,r:sr,g:sg,b:sb,key:morton(x,y)});
    }
    if(candidates.length<1000)throw new Error('Botanical image has insufficient foreground');
    candidates.sort((a,b)=>a.key-b.key);
    const positions=new Float32Array(count*3),colors=new Float32Array(count*3),cssColors=new Array(count);
    const enhance=(c,l)=>{
      const colored=Math.max(0,l+(c-l)*1.32);
      const exposure=Math.max(.32,Math.pow(l,.8))/Math.max(l,.01);
      return Math.min(.96,colored*exposure);
    };
    for(let i=0;i<count;i++){
      const p=candidates[Math.min(candidates.length-1,Math.floor((i+.5)/count*candidates.length))],at=i*3;
      // Deterministic, even placement replaces independent random dots.
      const x=(p.x+.5)/size*2-1,y=1-(p.y+.5)/size*2;
      positions[at]=x*1.25;positions[at+1]=y*1.25;
      // A gently domed depth field adds parallax without distorting the specimen.
      const luminance=(p.r*.2126+p.g*.7152+p.b*.0722)/255;
      positions[at+2]=Math.sqrt(Math.max(0,1-x*x/.9-y*y/1.5))*.3+luminance*.055+(random()-.5)*.012;
      colors[at]=enhance(p.r/255,luminance);colors[at+1]=enhance(p.g/255,luminance);colors[at+2]=enhance(p.b/255,luminance);
      cssColors[i]=`rgb(${Math.round(colors[at]*255)},${Math.round(colors[at+1]*255)},${Math.round(colors[at+2]*255)})`;
    }
    return {positions,colors,cssColors};
  }
  let shapes;
  try{shapes=(await Promise.all(images.map(load))).map(sample);}catch(error){console.warn(error);return;}
  const vertex=`precision highp float;
    attribute vec3 aFrom,aTo,aColorFrom,aColorTo;
    attribute float aSeed;
    uniform float uMorph,uTime,uAspect,uScale,uDpr,uPointerActive,uMotion;
    uniform vec2 uPointer;
    varying vec3 vColor;
    varying float vAlpha;
    void main(){
      float m=uMorph*uMorph*(3.-2.*uMorph);
      vec3 p=mix(aFrom,aTo,m);
      float scatter=sin(m*3.14159265);
      p.x+=scatter*sin(aSeed*43.+uTime*.25)*.13;
      p.y+=scatter*cos(aSeed*37.+uTime*.2)*.1;
      p.z+=scatter*sin(aSeed*29.)*.25;
      p.x+=sin(uTime*.6+p.y*4.+aSeed*6.)*.0025*uMotion;
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
      gl_PointSize=clamp((1.45+aSeed*.25)*uDpr*depth,1.,7.);
      vColor=mix(aColorFrom,aColorTo,m);
      vAlpha=.66;
    }`;
  const fragment=`precision mediump float;
    varying vec3 vColor; varying float vAlpha;
    void main(){
      float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
      float alpha=(1.-smoothstep(.68,1.,r))*vAlpha;
      // Premultiplied screen blending can add light, never paint dark dots
      // over already bright fibers or leaves.
      gl_FragColor=vec4(vColor*alpha,alpha);
    }`;
  let gl,ctx,program,buffers,uniforms,raf=0,last=0,time=0,paused=false,lost=false,current=-1;
  let width=1,height=1,dpr=1;
  const pointer={x:0,y:0,active:0,smoothX:0,smoothY:0,strength:0};
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
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
    for(const name of ['uMorph','uTime','uAspect','uScale','uDpr','uPointerActive','uMotion','uPointer'])uniforms[name]=gl.getUniformLocation(program,name);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);gl.clearColor(6/255,9/255,15/255,1);current=-1;lost=false;
  }
  function state(){
    // Five-second hold with continuous camera drift; four-second transition.
    const step=Math.floor(time/9)%10,t=Math.max(0,(time%9-5)/4);
    return {step,next:(step+1)%10,t,m:t*t*(3-2*t)};
  }
  function resize(){const r=stage.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,3,Math.sqrt(3500000/(width*height)));canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(gl&&!lost)gl.viewport(0,0,canvas.width,canvas.height);draw();}
  function draw(){
    if(lost)return;
    if(ctx){drawCanvas();return;}
    const {step,next,t}=state();
    if(current!==step){
      for(const [name,data] of [['aFrom',shapes[step].positions],['aTo',shapes[next].positions],['aColorFrom',shapes[step].colors],['aColorTo',shapes[next].colors]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}current=step;
    }
    gl.uniform1f(uniforms.uMorph,t);gl.uniform1f(uniforms.uTime,time);gl.uniform1f(uniforms.uAspect,width/height);gl.uniform1f(uniforms.uScale,Math.min(.7,width/height*.75));gl.uniform1f(uniforms.uDpr,dpr);gl.uniform1f(uniforms.uMotion,reduced.matches?0:1);gl.uniform2f(uniforms.uPointer,pointer.smoothX,pointer.smoothY);gl.uniform1f(uniforms.uPointerActive,pointer.strength);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.POINTS,0,count);
  }
  function drawCanvas(){
    const {step,next,m}=state(),a=shapes[step],b=shapes[next];
    const scatter=Math.sin(m*Math.PI),scale=Math.min(.7,width/height*.75),motion=reduced.matches?0:1;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='#06090f';ctx.fillRect(0,0,width,height);ctx.globalCompositeOperation='screen';ctx.globalAlpha=.66;
    const yaw=Math.sin(time*.52)*.14*motion,pitch=Math.sin(time*.41+.4)*.045*motion;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    // Full sample count retains botanical detail in the compatibility renderer.
    for(let i=0;i<count;i++){
      const at=i*3,s=seeds[i];
      let x=a.positions[at]*(1-m)+b.positions[at]*m+scatter*Math.sin(s*43+time*.25)*.13;
      let y=a.positions[at+1]*(1-m)+b.positions[at+1]*m+scatter*Math.cos(s*37+time*.2)*.1;
      let z=a.positions[at+2]*(1-m)+b.positions[at+2]*m+scatter*Math.sin(s*29)*.25;
      x+=Math.sin(time*.6+y*4+s*6)*.0025*motion;y+=Math.sin(time*.45)*.007*motion;
      const rx=x*cy+z*sy,rz=-x*sy+z*cy;
      z=y*sp+rz*cp;y=y*cp-rz*sp;x=rx;
      const depth=3.6/(3.6-z);x*=scale*depth;y*=scale*depth;
      const dx=x-pointer.smoothX,dy=y-pointer.smoothY,d=Math.hypot(dx,dy),f=Math.max(0,1-d/.27)**2*.14*pointer.strength*motion/Math.max(d,.002);x+=dx*f;y+=dy*f;
      if(m===0){ctx.fillStyle=a.cssColors[i];}else{
        const r=Math.round((a.colors[at]*(1-m)+b.colors[at]*m)*255),g=Math.round((a.colors[at+1]*(1-m)+b.colors[at+1]*m)*255),bl=Math.round((a.colors[at+2]*(1-m)+b.colors[at+2]*m)*255);
        ctx.fillStyle=`rgb(${r},${g},${bl})`;
      }
      const px=width/2+x*height/2,py=height/2-y*height/2,size=(1.25+s*.18)*depth;
      ctx.fillRect(px-size/2,py-size/2,size,size);
    }
  }
  function frame(now){raf=0;if(last)time+=Math.min((now-last)/1000,.2);last=now;pointer.smoothX+=(pointer.x-pointer.smoothX)*.12;pointer.smoothY+=(pointer.y-pointer.smoothY)*.12;pointer.strength+=(pointer.active-pointer.strength)*.09;draw();if(!paused&&!reduced.matches&&!document.hidden&&!lost)raf=requestAnimationFrame(frame);}
  function sync(){cancelAnimationFrame(raf);raf=0;last=0;toggle.textContent=paused?'▶':'Ⅱ';toggle.setAttribute('aria-label',paused?'Resume motion':'Pause motion');toggle.setAttribute('aria-pressed',String(paused));toggle.hidden=reduced.matches||lost;if(!paused&&!reduced.matches&&!document.hidden&&!lost)raf=requestAnimationFrame(frame);else draw();}
  toggle.addEventListener('click',()=>{paused=!paused;sync();});
  stage.addEventListener('pointermove',e=>{if(reduced.matches)return;const r=stage.getBoundingClientRect();pointer.x=((e.clientX-r.left)/width*2-1)*width/height;pointer.y=1-(e.clientY-r.top)/height*2;pointer.active=1;});
  for(const name of ['pointerleave','pointercancel','pointerup'])stage.addEventListener(name,()=>{pointer.active=0;});
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',()=>{if(reduced.matches){time=0;pointer.active=pointer.strength=0;}sync();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;document.documentElement.classList.remove('webgl-ready');sync();});
  canvas.addEventListener('webglcontextrestored',()=>{try{setup();resize();document.documentElement.classList.add('webgl-ready');sync();}catch{document.documentElement.classList.remove('webgl-ready');}});
  try{setup();}catch(error){console.warn('Using Canvas compatibility renderer:',error.message);const replacement=canvas.cloneNode();canvas.replaceWith(replacement);canvas=replacement;gl=null;ctx=canvas.getContext('2d');if(!ctx)return;}
  document.documentElement.classList.add('webgl-ready');toggle.hidden=false;new ResizeObserver(resize).observe(stage);resize();sync();
})();
