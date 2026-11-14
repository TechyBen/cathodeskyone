// The cathode-ray pass: the 2D screen is uploaded as a texture and drawn
// through a shader with phosphor glow, scanlines, a little line jitter, grain,
// flicker, a slow rolling band, one colour of phosphor, vignette and (full screen) a curved tube.
// Behind a light Bluesky theme it's inverted to dark lines on pale paper,
// like the hard copy, so the page's dark text stays readable.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uSrc, uOut;
uniform float uTime, uBright, uCurve, uInvert;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 tap(vec2 uv) { return texture2D(uTex, vec2(uv.x, 1.0 - uv.y)).rgb; }
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  c *= 1.0 + uCurve * dot(c.yx, c.yx);
  vec2 uv = c * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(vec3(uInvert * 0.9), 1.0); return; }
  float row = floor((1.0 - uv.y) * uSrc.y);
  uv.x += (hash(vec2(row, floor(uTime * 24.0))) - 0.5) * 0.7 / uSrc.x;
  vec3 col = tap(uv);
  vec2 px = 1.0 / uSrc;
  vec3 glow = vec3(0.0);
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      glow += tap(uv + vec2(float(i), float(j)) * px * 1.6);
    }
  }
  col += glow / 25.0 * 0.75;
  col = vec3(dot(col, vec3(0.2126, 0.7152, 0.0722)));
  float scan = 0.82 + 0.18 * cos(gl_FragCoord.y * 3.14159 * 0.66);
  col *= scan;
  float band = smoothstep(0.0, 0.12, abs(fract(uv.y * 0.6 - uTime * 0.05) - 0.5));
  col *= 0.94 + 0.06 * band;
  col *= 0.975 + 0.025 * sin(uTime * 113.0);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.07;
  vec2 v = vUv * (1.0 - vUv);
  col *= pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.25);
  col = clamp(col * vec3(0.93, 0.98, 1.0) * uBright, 0.0, 1.0);
  if (uInvert > 0.5) col = vec3(0.93, 0.92, 0.89) - col * vec3(0.78, 0.8, 0.82);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Crt {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no WebGL');
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    gl.useProgram(p);
    this.u = {};
    for (const k of ['uTex', 'uSrc', 'uOut', 'uTime', 'uBright', 'uCurve', 'uInvert']) this.u[k] = gl.getUniformLocation(p, k);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uTex, 0);
  }

  upload(src) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    this.src = [src.width, src.height];
  }

  // rect: where the screen goes, in device pixels from the bottom left.
  render({ rect, time, bright, curve, invert }) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const bg = invert ? 0.9 : 0;
    gl.clearColor(bg, bg, bg, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(rect.x, rect.y, rect.w, rect.h);
    gl.uniform2f(this.u.uSrc, this.src[0], this.src[1]);
    gl.uniform2f(this.u.uOut, rect.w, rect.h);
    gl.uniform1f(this.u.uTime, time);
    gl.uniform1f(this.u.uBright, bright);
    gl.uniform1f(this.u.uCurve, curve);
    gl.uniform1f(this.u.uInvert, invert ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
