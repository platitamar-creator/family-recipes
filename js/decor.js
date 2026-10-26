// קישוטים ואנימציות: סיר מהביל, מחבת עם ביצה מתהפכת, קישוטים בצדי המסך, וקונפטי של אוכל.
// כל האנימציות נעצרות אצל מי שביקש "פחות תנועה" במכשיר (ראו css/input.css).

// אדים עולים (שלושה קווים גליים)
const steam = (x, y, scale = 1) => `
  <g class="steam" transform="translate(${x} ${y}) scale(${scale})" stroke="#B9A391" stroke-width="5" stroke-linecap="round" fill="none">
    <path class="steam-1" d="M-18 0 C-26 -14 -10 -22 -18 -36"/>
    <path class="steam-2" d="M0 -4 C-8 -18 8 -26 0 -42"/>
    <path class="steam-3" d="M18 0 C10 -14 26 -22 18 -36"/>
  </g>`;

// סיר עם מכסה מקפץ ואדים
export const potSVG = (cls = 'h-24 w-24') => `
  <svg class="${cls}" viewBox="0 0 160 160" aria-hidden="true">
    ${steam(80, 46, 0.9)}
    <g class="pot-lid">
      <ellipse cx="80" cy="62" rx="50" ry="9" fill="#C9622A"/>
      <rect x="72" y="46" width="16" height="10" rx="5" fill="#A14C20"/>
    </g>
    <path d="M30 68 H130 V112 C130 128 118 138 102 138 H58 C42 138 30 128 30 112 Z" fill="#E07A3F"/>
    <path d="M30 68 H130 V80 H30 Z" fill="#C9622A" opacity=".5"/>
    <path d="M42 90 C46 112 52 124 64 128" stroke="#F3AC7A" stroke-width="5" stroke-linecap="round" fill="none" opacity=".8"/>
    <rect x="12" y="78" width="22" height="10" rx="5" fill="#A14C20"/>
    <rect x="126" y="78" width="22" height="10" rx="5" fill="#A14C20"/>
    <g class="bubbles" fill="#FDF5E9">
      <circle class="bubble-1" cx="62" cy="70" r="4"/><circle class="bubble-2" cx="96" cy="70" r="3"/><circle class="bubble-3" cx="80" cy="70" r="3.5"/>
    </g>
  </svg>`;

// מחבת עם ביצה שמתהפכת
export const panSVG = (cls = 'h-28 w-28') => `
  <svg class="${cls}" viewBox="0 0 160 160" aria-hidden="true">
    <g class="egg-flip">
      <ellipse cx="70" cy="70" rx="26" ry="20" fill="#FFFBF5" stroke="#F0D9B5" stroke-width="2"/>
      <circle cx="74" cy="68" r="9" fill="#F7B733"/>
      <circle cx="71" cy="65" r="3" fill="#FFE29A"/>
    </g>
    <ellipse cx="70" cy="112" rx="52" ry="14" fill="#5B4636"/>
    <ellipse cx="70" cy="108" rx="46" ry="10" fill="#8A6E58"/>
    <rect x="116" y="104" width="40" height="10" rx="5" fill="#3B2A1E" transform="rotate(-8 116 104)"/>
  </svg>`;

// כף עץ ומטרפה מוצלבות
export const utensilsSVG = (cls = 'h-24 w-24') => `
  <svg class="${cls}" viewBox="0 0 120 160" aria-hidden="true">
    <g transform="rotate(-18 60 80)">
      <ellipse cx="38" cy="30" rx="14" ry="20" fill="#D4A24C"/>
      <rect x="34" y="46" width="8" height="100" rx="4" fill="#D4A24C"/>
      <ellipse cx="38" cy="28" rx="7" ry="11" fill="#B5835A" opacity=".5"/>
    </g>
    <g transform="rotate(16 60 80)" fill="none" stroke="#8A6E58" stroke-width="3.5" stroke-linecap="round">
      <path d="M80 70 L80 148"/>
      <path d="M80 70 C60 40 66 10 80 10 C94 10 100 40 80 70"/>
      <path d="M80 70 C72 44 74 18 80 18 C86 18 88 44 80 70"/>
    </g>
  </svg>`;

// לימון, עגבנייה ועלי בזיליקום
export const produceSVG = (cls = 'h-24 w-24') => `
  <svg class="${cls}" viewBox="0 0 160 140" aria-hidden="true">
    <g class="float-a">
      <circle cx="104" cy="84" r="34" fill="#E2574C"/>
      <path d="M92 52 C98 58 110 58 116 52 C112 62 96 62 92 52 Z" fill="#7A9E7E"/>
      <path d="M104 50 L104 42" stroke="#4A6A4E" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="92" cy="76" rx="7" ry="10" fill="#fff" opacity=".25"/>
    </g>
    <g class="float-b">
      <ellipse cx="46" cy="96" rx="30" ry="22" fill="#F7D27A" transform="rotate(-20 46 96)"/>
      <circle cx="20" cy="106" r="4" fill="#F7D27A"/>
      <ellipse cx="40" cy="90" rx="8" ry="5" fill="#fff" opacity=".35" transform="rotate(-20 40 90)"/>
    </g>
    <g class="float-c" fill="#7A9E7E">
      <path d="M52 40 C60 22 80 22 86 28 C80 44 62 48 52 40 Z"/>
      <path d="M52 40 C46 26 30 22 22 26 C26 42 42 46 52 40 Z" fill="#5F8463"/>
    </g>
  </svg>`;

// קישוטים קבועים בצדי המסך (במסכים רחבים בלבד, לא מפריעים ללחיצות)
export function mountSideDecor() {
  if (document.getElementById('side-decor')) return;
  const el = document.createElement('div');
  el.id = 'side-decor';
  el.setAttribute('aria-hidden', 'true');
  el.className = 'pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden xl:block';
  el.innerHTML = `
    <div class="absolute bottom-10 left-6 animate-float-slow opacity-90">${potSVG('h-40 w-40')}</div>
    <div class="absolute left-10 top-40 animate-float-slower opacity-70">${utensilsSVG('h-36 w-28')}</div>
    <div class="absolute right-6 top-28 animate-float-slower opacity-80">${produceSVG('h-36 w-40')}</div>
    <div class="absolute bottom-12 right-10 animate-float-slow opacity-80">${panSVG('h-36 w-36')}</div>`;
  document.body.appendChild(el);
}

// קונפטי של אוכל מנקודה מסוימת (למשל הכפתור שנלחץ)
const FOOD = ['🍅', '🥕', '🧄', '🍋', '🌿', '🧀', '🥚', '🍰', '🥐', '🫑', '✨', '❤️'];
export function confetti(fromEl, count = 22) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = fromEl?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const x0 = r.left + r.width / 2;
  const y0 = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.textContent = FOOD[Math.floor(Math.random() * FOOD.length)];
    s.className = 'pointer-events-none fixed z-[60] select-none text-2xl';
    s.style.left = `${x0}px`;
    s.style.top = `${y0}px`;
    document.body.appendChild(s);
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 140;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 120;
    s.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.4) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 220}px)) scale(.9) rotate(${Math.random() * 540}deg)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' },
    ).onfinish = () => s.remove();
  }
}
