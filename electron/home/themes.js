// Home screen themes: each one sets the wallpaper, the Liquid Glass look and the text, in one click.
// Used by the home screen page and by Bbokari's menu/chat. `pet` is the scene the pet plays to match.
export const THEMES = {
  clean: { label: '☀️ Clean', wallpaper: { type: 'gradient', value: 'dawn' }, glass: {}, textDark: false, pet: null },
  glass: { label: '🫧 Liquid Glass', wallpaper: { type: 'gradient', value: 'candy' }, glass: { refDispersion: 30, refThickness: 26, refDistance: 0.08, glareFactor: 100, blurRadius: 10, tint: { r: 255, g: 255, b: 255, a: 0.04 } }, textDark: true, pet: 'glass' },
  hacker: { label: '💻 Hacker', wallpaper: { type: 'animated', value: 'matrix' }, glass: { tint: { r: 0, g: 255, b: 110, a: 0.16 }, refDispersion: 12, blurRadius: 16, glareAngle: 45 }, textDark: false, font: 'mono', pet: 'hacker' },
  midnight: { label: '🌙 Midnight', wallpaper: { type: 'animated', value: 'stars' }, glass: { tint: { r: 20, g: 22, b: 40, a: 0.4 }, blurRadius: 20, glareFactor: 60 }, textDark: false, pet: 'midnight' },
  sunset: { label: '🌅 Sunset', wallpaper: { type: 'gradient', value: 'sunset' }, glass: { tint: { r: 255, g: 140, b: 120, a: 0.18 }, blurRadius: 16 }, textDark: false, pet: 'sunset' },
  aurora: { label: '🌌 Aurora', wallpaper: { type: 'animated', value: 'aurora' }, glass: { blurRadius: 26, tint: { r: 255, g: 255, b: 255, a: 0.12 }, refDispersion: 14 }, textDark: false, pet: 'midnight' },
  ocean: { label: '🌊 Ocean', wallpaper: { type: 'animated', value: 'waves' }, glass: { blurRadius: 18, refDispersion: 10 }, textDark: false, pet: 'glass' },
  winter: { label: '❄️ Winter night', wallpaper: { type: 'animated', value: 'winter' }, glass: { blurRadius: 18 }, textDark: false, pet: 'midnight' },
};
