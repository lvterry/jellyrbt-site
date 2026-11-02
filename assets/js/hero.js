/* Dependency-free WebGL point sprites. Geometry is sampled once; morphing,
   breathing, soft repulsion and light are evaluated in the vertex/fragment shaders. */
(() => {
  'use strict';
  let canvas = document.getElementById('particles');
  const stage = canvas.parentElement;
  const toggle = document.getElementById('motion-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const count = matchMedia('(max-width: 600px)').matches ? 8500 : 16000;
  const TAU = Math.PI * 2;
  let seed = 71;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296; };
  const samples = Array.from({length:count},()=>[random(),random(),random(),random()]);
  function ellipsoid(u,v,c,r,angle=0) {
    const phi = TAU*u, yy = 2*v-1, rr = Math.sqrt(1-yy*yy);
    const x=r[0]*rr*Math.cos(phi), y=r[1]*yy;
    return [c[0]+x*Math.cos(angle)-y*Math.sin(angle),c[1]+x*Math.sin(angle)+y*Math.cos(angle),c[2]+r[2]*rr*Math.sin(phi)];
  }
  // Five distinct silhouettes: umbrella, moon, tall bell, crown and swept bell.
  function jelly(s,k) {
    const [u,v,w] = s, a = TAU*u;
    const width=[.86,1.05,.68,.95,.8][k], height=[.66,.4,.9,.57,.74][k];
    let x,y,z;
    if(w<.57){
      const p=v*Math.PI/2, r=Math.sin(p)*width;
      x=r*Math.cos(a); z=r*Math.sin(a)*.62;
      y=.18+Math.cos(p)*height;
      y+=Math.pow(v,8)*.045*Math.cos(a*(k===3?12:8));
    }else if(w<.67){
      x=width*Math.cos(a);z=width*Math.sin(a)*.62;y=.18+.035*Math.cos(a*10)+.05*(v-.5);
    }else{
      const strand=Math.floor(u*28), phase=strand*2.39996, t=v;
      const r=width*(.22+.65*((strand%7)/6));
      x=Math.cos(phase)*r + Math.sin(t*8+phase)*(.04+t*.12);
      z=Math.sin(phase)*r*.56+Math.cos(t*7+phase)*.08;
      y=.16-t*(1.05+.38*Math.sin(strand*3.7)**2);
      x+=t*t*[.04,-.1,.14,-.14,.36][k];
    }
    const tilt=[-.07,.09,-.12,.03,.23][k];
    return [x*Math.cos(tilt)-y*Math.sin(tilt),x*Math.sin(tilt)+y*Math.cos(tilt)+.14,z];
  }
  // Each pose is assembled from anatomical ellipsoids: body, head, two ears,
  // haunches, paws, muzzle and tail. Unequal ears make the five poses legible.
  function rabbit(s,k) {
    const [u,v,w] = s;
    const poses=[
      {head:[.05,.37,0],ears:[-.16,.18],body:[.48,.59,.34],lean:0},
      {head:[.29,.3,0],ears:[-.6,-.32],body:[.63,.42,.34],lean:-.08},
      {head:[-.17,.4,0],ears:[.48,-.28],body:[.43,.62,.33],lean:.12},
      {head:[.08,.22,0],ears:[-1.0,.76],body:[.57,.4,.36],lean:0},
      {head:[.3,.42,0],ears:[-.38,.18],body:[.55,.48,.32],lean:-.2}
    ];
    const p=poses[k], h=p.head;
    let c,r,angle=0;
    if(w<.36){c=[-.06,-.34,0];r=p.body;angle=p.lean;}
    else if(w<.57){c=h;r=[.33,.32,.29];}
    else if(w<.685){c=[h[0]-.17,h[1]+.48,-.015];r=[.105,.43,.105];angle=p.ears[0];}
    else if(w<.8){c=[h[0]+.15,h[1]+.48,-.025];r=[.10,.45,.10];angle=p.ears[1];}
    else if(w<.87){c=[-.35,-.61,.14];r=[.26,.29,.26];}
    else if(w<.92){c=[.27,-.76,.15];r=[.31,.12,.2];}
    else if(w<.96){c=[-.58,-.42,-.04];r=[.18,.18,.18];}
    else{c=[h[0]+.22,h[1]-.08,.15];r=[.19,.14,.18];}
    const pt=ellipsoid(u,v,c,r,angle);
    // Slight three-quarter view; keep both ears visible.
    const yaw=[-.2,.35,-.4,.08,.5][k];
    return [pt[0]*Math.cos(yaw)+pt[2]*Math.sin(yaw),pt[1],-pt[0]*Math.sin(yaw)+pt[2]*Math.cos(yaw)];
  }
  const shapes=Array.from({length:10},(_,i)=>{
    const data=new Float32Array(count*3);
    samples.forEach((s,n)=>data.set(i%2?rabbit(s,(i-1)/2):jelly(s,i/2),n*3));
    return data;
  });
  const vertex=`
    precision highp float;
    attribute vec3 aFrom, aTo;
    attribute float aSeed;
    uniform float uMorph,uTime,uAspect,uScale,uDpr,uPointerActive,uMotion;
    uniform vec2 uPointer;
    uniform vec3 uColorFrom,uColorTo;
    varying vec3 vColor;
    varying float vAlpha;
    void main(){
      float m=uMorph*uMorph*(3.0-2.0*uMorph);
      vec3 p=mix(aFrom,aTo,m);
      float scatter=sin(m*3.14159265);
      p.x+=scatter*sin(aSeed*43.0+uTime*.25)*.19;
      p.y+=scatter*cos(aSeed*37.0+uTime*.2)*.13;
      p.z+=scatter*sin(aSeed*29.0)*.45;
      p.xy*=1.0+sin(uTime*1.1)*.016*uMotion;
      p.x+=sin(uTime*.8+p.y*3.0+aSeed*5.0)*.012*uMotion;
      p.y+=sin(uTime*.6)*.025*uMotion;
      float angle=sin(uTime*.19)*.13*uMotion;
      p.xz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xz;
      float depth=3.6/(3.6-p.z);
      vec2 screen=p.xy*uScale*depth;
      vec2 delta=screen-uPointer;
      float d=length(delta);
      float force=pow(max(0.0,1.0-d/.29),2.0)*.17*uPointerActive*uMotion;
      screen+=delta/max(d,.002)*force;
      gl_Position=vec4(screen.x/uAspect,screen.y,0.,1.);
      gl_PointSize=clamp((1.25+aSeed*1.85)*uDpr*depth,1.,9.);
      vColor=mix(uColorFrom,uColorTo,m);
      vColor=mix(vColor,vec3(.96,.99,1.),aSeed*.48);
      vAlpha=(.32+.55*aSeed)*(.88+.12*sin(uTime*1.4+aSeed*100.))*clamp(depth,.6,1.25);
    }`;
  const fragment=`
    precision mediump float;
    varying vec3 vColor;
    varying float vAlpha;
    void main(){
      float r=length(gl_PointCoord-.5)*2.;
      if(r>1.)discard;
      float light=exp(-r*r*4.5)*.55+exp(-r*r*22.)*.65;
      gl_FragColor=vec4(vColor,light*vAlpha);
    }`;
  let gl,program,buffers,uniforms,raf=0,last=0,time=0,paused=false,lost=false;
  let width=1,height=1,dpr=1;
  const pointer={x:0,y:0,active:0,smoothX:0,smoothY:0,strength:0};
  function shader(type,source){
    const result=gl.createShader(type);gl.shaderSource(result,source);gl.compileShader(result);
    if(!gl.getShaderParameter(result,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(result));
    return result;
  }
  function setup(){
    gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,powerPreference:'low-power'});
    if(!gl)throw new Error('WebGL unavailable');
    program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);buffers={};
    for(const name of ['aFrom','aTo','aSeed']){
      const buffer=gl.createBuffer(),location=gl.getAttribLocation(program,name);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,name==='aSeed'?1:3,gl.FLOAT,false,0,0);buffers[name]=buffer;
    }
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(samples.map(s=>s[3])),gl.STATIC_DRAW);
    uniforms={};
    for(const name of ['uMorph','uTime','uAspect','uScale','uDpr','uPointerActive','uMotion','uPointer','uColorFrom','uColorTo'])uniforms[name]=gl.getUniformLocation(program,name);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.clearColor(0,0,0,0);
    current=-1;lost=false;document.documentElement.classList.add('webgl-ready');toggle.hidden=false;
  }
  let ctx=null;
  let current=-1;
  const colors=[[.29,.74,.91],[.95,.64,.48],[.48,.71,.97],[.91,.73,.58],[.37,.85,.77],[.98,.65,.65],[.55,.65,1.],[.91,.75,.58],[.36,.78,.9],[.92,.61,.76]];
  function resize(){
    const rect=stage.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    if(!lost){if(gl)gl.viewport(0,0,canvas.width,canvas.height);draw();}
  }
  function draw(){
    if(lost)return;
    if(ctx){drawCanvas();return;}
    if(!gl)return;
    // 3 seconds of recognisable form, then a 5 second fluid transformation.
    const step=Math.floor(time/8)%10,next=(step+1)%10,progress=(time%8-3)/5;
    if(current!==step){
      for(const [name,data] of [['aFrom',shapes[step]],['aTo',shapes[next]]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}
      current=step;
    }
    gl.uniform1f(uniforms.uMorph,Math.max(0,progress));gl.uniform1f(uniforms.uTime,time);
    gl.uniform1f(uniforms.uAspect,width/height);gl.uniform1f(uniforms.uScale,Math.min(.66,width/height*.76));gl.uniform1f(uniforms.uDpr,dpr);
    gl.uniform1f(uniforms.uMotion,reduced.matches?0:1);gl.uniform2f(uniforms.uPointer,pointer.smoothX,pointer.smoothY);gl.uniform1f(uniforms.uPointerActive,pointer.strength);
    gl.uniform3fv(uniforms.uColorFrom,colors[step]);gl.uniform3fv(uniforms.uColorTo,colors[next]);
    gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.POINTS,0,count);
  }
  // Compatibility renderer uses the same ten target clouds and timing.
  // It also makes software-only browsers useful, without loading a library.
  function drawCanvas(){
    const step=Math.floor(time/8)%10,next=(step+1)%10;
    const t=Math.max(0,(time%8-3)/5),m=t*t*(3-2*t),scatter=Math.sin(m*Math.PI);
    const scale=Math.min(.66,width/height*.76),motion=reduced.matches?0:1;
    const angle=Math.sin(time*.19)*.13*motion,ca=Math.cos(angle),sa=Math.sin(angle);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.globalCompositeOperation='lighter';
    const col=colors[step].map((c,i)=>Math.round(255*(c+(colors[next][i]-c)*m)));
    ctx.fillStyle=`rgb(${col.join(',')})`;
    for(let i=0;i<count;i+=3){
      const at=i*3,s=samples[i][3];
      let x=shapes[step][at]*(1-m)+shapes[next][at]*m+scatter*Math.sin(s*43+time*.25)*.19;
      let y=shapes[step][at+1]*(1-m)+shapes[next][at+1]*m+scatter*Math.cos(s*37+time*.2)*.13;
      let z=shapes[step][at+2]*(1-m)+shapes[next][at+2]*m+scatter*Math.sin(s*29)*.45;
      const breathe=1+Math.sin(time*1.1)*.016*motion;x*=breathe;y*=breathe;
      x+=Math.sin(time*.8+y*3+s*5)*.012*motion;y+=Math.sin(time*.6)*.025*motion;
      const xx=x*ca-z*sa;z=x*sa+z*ca;x=xx;
      const depth=3.6/(3.6-z);x*=scale*depth;y*=scale*depth;
      const dx=x-pointer.smoothX,dy=y-pointer.smoothY,d=Math.hypot(dx,dy);
      const f=Math.max(0,1-d/.29)**2*.17*pointer.strength*motion/Math.max(d,.002);x+=dx*f;y+=dy*f;
      const px=width/2+x*height/2,py=height/2-y*height/2,r=(.55+s*.6)*depth;
      ctx.globalAlpha=.32+s*.48;ctx.beginPath();ctx.arc(px,py,r,0,TAU);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  function frame(now){
    raf=0;if(last)time+=Math.min((now-last)/1000,.05);last=now;
    pointer.smoothX+=(pointer.x-pointer.smoothX)*.12;pointer.smoothY+=(pointer.y-pointer.smoothY)*.12;pointer.strength+=(pointer.active-pointer.strength)*.09;
    draw();if(!paused&&!reduced.matches&&!document.hidden&&!lost)raf=requestAnimationFrame(frame);
  }
  function sync(){
    cancelAnimationFrame(raf);raf=0;last=0;
    toggle.textContent=paused?'▶':'Ⅱ';toggle.setAttribute('aria-label',paused?'Resume motion':'Pause motion');toggle.setAttribute('aria-pressed',String(paused));
    toggle.hidden=reduced.matches||lost;
    if(!paused&&!reduced.matches&&!document.hidden&&!lost)raf=requestAnimationFrame(frame);else draw();
  }
  toggle.addEventListener('click',()=>{paused=!paused;sync();});
  stage.addEventListener('pointermove',e=>{
    if(reduced.matches)return;
    const r=stage.getBoundingClientRect();pointer.x=((e.clientX-r.left)/width*2-1)*width/height;pointer.y=1-(e.clientY-r.top)/height*2;pointer.active=1;
  });
  for(const name of ['pointerleave','pointercancel','pointerup'])stage.addEventListener(name,()=>{pointer.active=0;});
  document.addEventListener('visibilitychange',sync);
  reduced.addEventListener('change',()=>{if(reduced.matches){time=0;pointer.active=pointer.strength=0;}sync();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;document.documentElement.classList.remove('webgl-ready');sync();});
  canvas.addEventListener('webglcontextrestored',()=>{try{setup();resize();sync();}catch(error){console.warn(error);fallback();}});
  function fallback(){lost=true;cancelAnimationFrame(raf);document.documentElement.classList.remove('webgl-ready');toggle.hidden=true;}
  try{setup();}catch(error){
    console.warn('Using Canvas compatibility renderer:',error.message);
    const replacement=canvas.cloneNode();canvas.replaceWith(replacement);canvas=replacement;
    gl=null;ctx=canvas.getContext('2d');
    if(!ctx){fallback();return;}
    document.documentElement.classList.add('webgl-ready');toggle.hidden=false;
  }
  new ResizeObserver(resize).observe(stage);resize();sync();
})();
