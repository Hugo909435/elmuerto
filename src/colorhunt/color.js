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

export const COLOR_PALETTE = [
  { name: 'Blanc',            hex: '#FFFFFF' },
  { name: 'Noir',             hex: '#000000' },
  { name: 'Gris Clair',       hex: '#D9D9D9' },
  { name: 'Gris Foncé',       hex: '#555555' },
  { name: 'Rouge',            hex: '#FF0000' },
  { name: 'Rouge Bordeaux',   hex: '#7B1E3A' },
  { name: 'Rouge Brique',     hex: '#B5533C' },
  { name: 'Rose',             hex: '#FFC0CB' },
  { name: 'Rose Fuchsia',     hex: '#FF4FA3' },
  { name: 'Orange',           hex: '#FFA500' },
  { name: 'Orange Brûlé',    hex: '#CC5500' },
  { name: 'Jaune',            hex: '#FFFF00' },
  { name: 'Jaune Moutarde',   hex: '#D4A017' },
  { name: 'Beige',            hex: '#F5F5DC' },
  { name: 'Crème',            hex: '#FFFDD0' },
  { name: 'Marron',           hex: '#8B4513' },
  { name: 'Marron Chocolat',  hex: '#5A3825' },
  { name: 'Taupe',            hex: '#8B7D6B' },
  { name: 'Bleu Ciel',        hex: '#90D5FF' },
  { name: 'Bleu Foncé',       hex: '#111184' },
  { name: 'Bleu Marine',      hex: '#001F54' },
  { name: 'Bleu Turquoise',   hex: '#40E0D0' },
  { name: 'Bleu Pétrole',    hex: '#1F6F78' },
  { name: 'Vert',             hex: '#00A651' },
  { name: 'Vert Clair',       hex: '#90EE90' },
  { name: 'Vert Foncé',       hex: '#1E5631' },
  { name: 'Vert Olive',       hex: '#708238' },
  { name: 'Vert Menthe',      hex: '#98FF98' },
  { name: 'Vert Kaki',        hex: '#8F9779' },
  { name: 'Violet',           hex: '#8000FF' },
  { name: 'Violet Lavande',   hex: '#B57EDC' },
  { name: 'Lilas',            hex: '#C8A2C8' },
  { name: 'Mauve',            hex: '#A060A0' },
  { name: 'Cyan',             hex: '#00FFFF' },
  { name: 'Aqua',             hex: '#7FFFD4' },
  { name: 'Turquoise Clair',  hex: '#AFEEEE' },
  { name: 'Corail',           hex: '#FF7F50' },
  { name: 'Saumon',           hex: '#FA8072' },
  { name: 'Pêche',           hex: '#FFDAB9' },
  { name: 'Or',               hex: '#D4AF37' },
  { name: 'Argent',           hex: '#C0C0C0' },
  { name: 'Bronze',           hex: '#CD7F32' },
  { name: 'Ivoire',           hex: '#FFFFF0' },
  { name: 'Bordeaux Sombre',  hex: '#5E0B15' },
  { name: 'Prune',            hex: '#701C3A' },
  { name: 'Terracotta',       hex: '#C96A4A' },
  { name: 'Sable',            hex: '#CDB79E' },
  { name: 'Ardoise',          hex: '#708090' },
  { name: 'Indigo',           hex: '#4B0082' },
  { name: 'Anis',             hex: '#DFFF00' },
];

export function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function randomTarget() {
  const entry = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
  return { rgb: hexToRgb(entry.hex), name: entry.name };
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
