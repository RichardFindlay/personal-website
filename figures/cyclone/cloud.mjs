// The storm's cloud as a fragment shader, in the strip's own viewBox units.
// Everything about a storm lives in its own frame, turned by its spin, so the
// spiral is drawn in world space and rides the track the model gives. Every term
// falls to zero by RO, before the early return that skips empty pixels.
export const FRAGMENT = `precision highp float;
uniform vec4 uMap;   // viewBox x = fragX*uMap.x+uMap.y, y = fragY*uMap.z+uMap.w
uniform vec4 uA;     // storm A: eye x, eye y, spin, strength
uniform vec4 uB;
uniform vec4 uL;     // age and visibility of A, then of B
uniform float uShadow;
const float RC=50.,RB=175.,RO=240.,K=3.2,KF=1.25,KO=1.4;
const vec2 SUN=vec2(-.78,-.62);
float h13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);}
float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y);}
const mat2 RM=mat2(.8,.6,-.6,.8);
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n2(p);p=RM*p*2.03+17.1;a*=.5;}return s/.9375;}
float fbm2(vec2 p){return n2(p)*.667+n2(RM*p*2.03+5.3)*.333;}
// streaks along a spiral: noise round a circle in angle, fast across in log r
float streak(float ang,float lr,float f,float g,float drift){
  return n3(vec3(cos(ang)*f,sin(ang)*f,lr*g-drift))*.65+n3(vec3(cos(ang)*f*2.3,sin(ang)*f*2.3,lr*g*2.1-drift*1.7))*.35;
}
// x: cloud density, y: cloud-top height for the light, z: the eyewall
vec3 storm(vec2 p,vec4 S,float age,float fine){
  vec2 m=vec2(p.x-S.x,S.y-p.y);
  float r=length(m);
  if(r>RO)return vec3(0.);
  float far=1.-smoothstep(RO*.45,RO,r);
  float st=S.w;
  float c=cos(S.z),s=sin(S.z);
  vec2 q=vec2(c*m.x+s*m.y,-s*m.x+c*m.y);
  vec2 w=vec2(fbm(q*.016+3.1),fbm(q*.016+8.7))-.5;
  vec2 qw=q+w*34.*smoothstep(14.,80.,r);
  float rw=length(qw);
  float a=atan(qw.y,qw.x);
  float lr=log(max(rw,2.)/RC);
  float psi=a+K*lr;
  float vary=n2(qw*.012+5.);
  float blob=fbm(q*.05+1.7);
  // fine streaks along the inflow, the grain every satellite loop shows
  float flow=fine>0.?streak(a+KF*lr,lr,7.,11.,age*.006):.5;
  // convective towers: small round cells, sharper in the outer bands
  float cells=fine>0.?fbm(q*.24+vec2(0.,age*.008)):.5;
  float outer=smoothstep(RC*1.1,RB*.7,rw);
  // the rainbands: two broad arms, fainter ones between, thin lines along them
  float b1=.5+.5*cos(2.*psi+1.3*(vary-.5)+1.2*(blob-.5));
  float b2=.5+.5*cos(4.*psi+2.1+1.5*(blob-.5));
  float b3=.5+.5*cos(9.*psi+4.*(flow-.5));
  float band=smoothstep(.42,.95,b1)*(.55+.6*vary)+.45*smoothstep(.55,1.,b2)*(.4+.8*vary)+.22*smoothstep(.7,1.,b3)*outer;
  // the outer bands break into lines of towers
  band*=mix(1.,smoothstep(.32,.62,cells+.15*(flow-.5)),.75*outer);
  float env=smoothstep(RC*.55,RC*1.05,rw)*(1.-smoothstep(RB*.3,RB,rw*(1.+.4*(vary-.5))));
  // one arm trails far out as a feeder band of streaks
  float feeder=smoothstep(.6,.97,b1)*smoothstep(RB*.5,RB*.8,rw)*(1.-smoothstep(RB*.85,RO*.98,rw))*smoothstep(.35,.8,flow)*(.4+.6*vary);
  // a weak storm is a ragged mass, not yet a spiral
  float messy=smoothstep(.35,.75,blob+.25*(cells-.5))*smoothstep(RC*.4,RC*1.1,rw)*(1.-smoothstep(RB*.35,RB*.9,rw));
  float tex=.5+.6*flow+.3*(cells-.5)*outer;
  // low cloud in the moats: a thin haze with small cumulus in it
  float haze=env*(.04+.1*blob)+.16*env*smoothstep(.64,.8,cells)*outer;
  float dBand=clamp(mix(messy,band,.3+.7*st)*env*tex+haze+.55*feeder,0.,1.);
  // the eye, its wall, and the dense overcast round it
  float RE=mix(16.,9.,st);
  float er=r+2.4*(n2(q*.2+3.)-.5)+1.3*(n2(q*.5)-.5);
  float eye=smoothstep(RE*.62,RE*1.3,er);
  float wall=exp(-pow((er-RE*1.5)/(RE*.55),2.));
  float cdo=1.-smoothstep(RC*.5,RC*(1.08+.14*st),rw+20.*(blob-.5)+7.*(flow-.5));
  float core=cdo*mix(1.,eye,.96*smoothstep(.35,.8,st))*(.88+.2*(flow-.5))+(1.-eye)*.08*cells;
  // cirrus outflow: feathered streaks fanning out the other way at the rim
  float cir=0.;
  if(fine>0.){
    float po=a-KO*lr;
    float cs=streak(po,lr,15.,2.2,age*.012);
    float tuft=smoothstep(.3,.75,n3(vec3(cos(po)*3.,sin(po)*3.,lr*2.5)));
    cir=smoothstep(.3,.95,cs)*tuft*smoothstep(RC*1.2,RC*2.2,rw)*(1.-smoothstep(RO*.5,RO*.97,rw))*(.3+.9*vary);
  }
  float D=1.-(1.-clamp(core,0.,1.))*(1.-dBand)*(1.-.32*cir);
  D*=far*(.6+.4*st);
  // cloud tops: a dome over the core, towers in the bands, grain from the flow
  float dome=core*(1.-smoothstep(0.,RC*1.2,r));
  float Hc=.55*dome+.25*wall*core*st+(.34*(cells-.5)*(.5+outer)+.2*(flow-.5))*D+.25*D;
  return vec3(D,Hc,wall*core);
}
vec4 shade(vec2 p,vec4 S,float age,float vis){
  if(vis<.002)return vec4(0.);
  vec3 c0=storm(p,S,age,1.);
  if(c0.x<.001)return vec4(0.,0.,0.,uShadow*(1.-exp(-2.4*storm(p+SUN*7.,S,age,0.).x))*vis);
  vec3 c1=storm(p+SUN*1.6,S,age,1.);
  float Ds=storm(p+SUN*7.,S,age,0.).x;
  float lit=clamp(.66+(c0.y-c1.y)*2.4,0.,1.2);
  vec3 col=mix(vec3(.36,.45,.55),vec3(.93,.955,.975),lit);
  col=mix(col,vec3(.98,.985,.99),.3*c0.z);
  float a=min(1.,1.06*(1.-exp(-5.5*c0.x)));
  float sa=uShadow*(1.-exp(-2.4*Ds));
  return vec4(col*a,a+sa*(1.-a))*vis;
}
void main(){
  vec2 p=vec2(gl_FragCoord.x*uMap.x+uMap.y,gl_FragCoord.y*uMap.z+uMap.w);
  vec4 A=shade(p,uA,uL.x,uL.y);
  vec4 B=shade(p,uB,uL.z,uL.w);
  vec4 o=A+B*(1.-A.a);
  float n=(h12(gl_FragCoord.xy)+h12(gl_FragCoord.yx*1.37+3.1)-1.)/255.;
  o=max(o+n*smoothstep(0.,1.5/255.,o.a),0.);
  o.rgb=min(o.rgb,o.a);
  gl_FragColor=o;
}`;
