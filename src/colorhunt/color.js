// Color maths: sRGB ↔ Lab, the CIEDE2000 perceptual color-difference metric,
// target-color generation and a rough French color name for flavor.

// ---------- sRGB (0-255) → CIE Lab (D65) ----------
export function rgbToLab(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const inv = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  r = inv(r);
  g = inv(g);
  b = inv(b);

  // Linear sRGB → XYZ
  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  let z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  // Normalize by D65 reference white
  x /= 0.95047;
  y /= 1.0;
  z /= 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const deg2rad = (d) => (d * Math.PI) / 180;
function hueAngle(b, ap) {
  if (b === 0 && ap === 0) return 0;
  const h = (Math.atan2(b, ap) * 180) / Math.PI;
  return h >= 0 ? h : h + 360;
}

// ---------- CIEDE2000 color difference (the perceptual standard) ----------
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const kL = 1, kC = 1, kH = 1;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) > 180) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(deg2rad(hbarp - 30)) +
    0.24 * Math.cos(deg2rad(2 * hbarp)) +
    0.32 * Math.cos(deg2rad(3 * hbarp + 6)) -
    0.2 * Math.cos(deg2rad(4 * hbarp - 63));

  const dtheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(deg2rad(2 * dtheta)) * Rc;

  return Math.sqrt(
    Math.pow(dLp / (kL * Sl), 2) +
      Math.pow(dCp / (kC * Sc), 2) +
      Math.pow(dHp / (kH * Sh), 2) +
      Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh)),
  );
}

// ---------- HSL → RGB (for generating vivid targets) ----------
export function hslToRgb(h, s, l) {
  h /= 360;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function rgbToCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

// A recognizable, findable target color: vivid hue, mid lightness.
export function randomTarget() {
  const hue = Math.floor(Math.random() * 360);
  const sat = 0.55 + Math.random() * 0.4; // 55–95%
  const light = 0.4 + Math.random() * 0.25; // 40–65%
  const rgb = hslToRgb(hue, sat, light);
  return { rgb, name: colorName(hue, sat, light) };
}

// Rough French name from hue/saturation/lightness — just for flavor.
export function colorName(hue, sat, light) {
  if (sat < 0.18) {
    if (light < 0.25) return 'noir';
    if (light > 0.8) return 'blanc';
    return 'gris';
  }
  const names = [
    [15, 'rouge'],
    [45, 'orange'],
    [70, 'jaune'],
    [160, 'vert'],
    [200, 'cyan'],
    [255, 'bleu'],
    [290, 'violet'],
    [330, 'rose'],
    [360, 'rouge'],
  ];
  let base = 'rouge';
  for (const [max, n] of names) {
    if (hue <= max) {
      base = n;
      break;
    }
  }
  const prefix = light > 0.62 ? 'clair ' : light < 0.45 ? 'foncé ' : '';
  return (base + (prefix ? ' ' + prefix.trim() : '')).trim();
}

// Map a CIEDE2000 difference to a 0–100 score and a rating label.
export function scoreFromDeltaE(dE) {
  const points = Math.max(0, Math.round(100 - dE * 2));
  let rating;
  if (dE < 2) rating = 'Parfait ! 🎯';
  else if (dE < 5) rating = 'Excellent 🌟';
  else if (dE < 10) rating = 'Très bien 👍';
  else if (dE < 18) rating = 'Pas mal 🙂';
  else if (dE < 30) rating = 'Bof 😐';
  else rating = 'Raté 😬';
  return { points, rating };
}
