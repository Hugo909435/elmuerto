// Roue de sélection du mini-jeu.
// Rendu sur <canvas> (segments + libellés) ; la rotation est animée en CSS
// sur l'élément canvas lui-même. Le serveur impose l'index gagnant, donc tous
// les clients lancent spinTo(resultIndex) et s'arrêtent au même endroit.

const FALLBACK_COLORS = ['#4ade80', '#38bdf8', '#22a85a', '#0ea5e9', '#a78bfa', '#f59e0b'];

export class Roulette {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.segments = [];
    this.rotation = 0; // degrés appliqués actuellement
  }

  setSegments(segments) {
    this.segments = segments;
    this.rotation = 0;
    this.canvas.style.transition = 'none';
    this.canvas.style.transform = 'rotate(0deg)';
    this.draw();
  }

  draw() {
    const { ctx, canvas, segments } = this;
    const n = segments.length;
    if (!n) return;
    const size = canvas.width;
    const r = size / 2;
    const seg = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, size, size);

    for (let i = 0; i < n; i++) {
      // Le segment i commence en haut (−90°) et tourne dans le sens horaire.
      const start = -Math.PI / 2 + i * seg;
      const end = start + seg;

      ctx.beginPath();
      ctx.moveTo(r, r);
      ctx.arc(r, r, r - 4, start, end);
      ctx.closePath();
      ctx.fillStyle = segments[i].color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Libellé, posé radialement vers l'extérieur.
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(start + seg / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#05290f';
      ctx.font = `bold ${Math.max(13, size * 0.05)}px 'Trebuchet MS', system-ui, sans-serif`;
      const s = segments[i];
      ctx.fillText(`${s.emoji || ''} ${s.label || ''}`.trim(), r - 18, 0);
      ctx.restore();
    }

    // Moyeu central.
    ctx.beginPath();
    ctx.arc(r, r, size * 0.085, 0, 2 * Math.PI);
    ctx.fillStyle = '#0b1020';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Anime la roue jusqu'à placer le centre du segment `targetIndex` sous le
  // pointeur (en haut). Renvoie une promesse résolue à la fin de l'animation.
  spinTo(targetIndex, { spins = 6, duration = 5200 } = {}) {
    const n = this.segments.length;
    const segDeg = 360 / n;
    const center = targetIndex * segDeg + segDeg / 2; // horaire depuis le haut
    // Rotation horaire pour ramener ce centre à 0° (sous le pointeur).
    const finalDeg = 360 * spins - center;
    this.rotation = finalDeg;

    this.canvas.style.transition = `transform ${duration}ms cubic-bezier(0.16, 0.84, 0.18, 1)`;
    // Forcer un reflow pour que la transition parte bien de la rotation 0.
    void this.canvas.offsetWidth;
    this.canvas.style.transform = `rotate(${finalDeg}deg)`;

    return new Promise((resolve) => setTimeout(resolve, duration + 250));
  }
}
