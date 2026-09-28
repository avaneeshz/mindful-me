/**
 * Lumen's Soft pastel palette — the colours people can give their activities.
 *
 * Every colour follows one recipe, so the whole set feels like a family:
 * built in OKLCH (a colour space where equal numbers look equally bright), every
 * "pastel" colour shares one lightness and softness (L 0.86, C 0.085) and every
 * "deep" colour shares a slightly deeper one (L 0.77, C 0.095). Only the hue changes.
 *
 * 24 hues × 2 tones + 4 neutrals = 52 colours. Hues in the Day strip's amber/yellow
 * (~40–110°) and the Night strip's indigo/violet (~255–300°) are left out, so a logged
 * block never blends into empty time.
 *
 * Each colour carries five shades for a dark UI:
 *   highlight — brightest; text or outlines that must read clearly
 *   base      — the colour itself; strip blocks, charts, swatches
 *   hover     — a touch brighter; hover and pressed states of base
 *   surface   — dark tint; selected tiles, subtle tinted panels
 *   bubble    — darker tint; the circle behind an activity icon
 *
 * Generated values — regenerate rather than hand-editing individual hexes.
 */

export type PaletteTone = 'pastel' | 'deep' | 'neutral'

export type PaletteShades = {
  highlight: string
  base: string
  hover: string
  surface: string
  bubble: string
}

export type PaletteColor = {
  id: string
  name: string
  /** OKLCH hue in degrees; null for neutrals */
  hue: number | null
  tone: PaletteTone
  shades: PaletteShades
}

export const PALETTE: PaletteColor[] = [
  { id: 'rose', name: 'Rose', hue: 5, tone: 'pastel', shades: { highlight: '#ffe1e8', base: '#ffbac9', hover: '#ffc4d5', surface: '#493035', bubble: '#342024' } },
  { id: 'rosewood', name: 'Rosewood', hue: 5, tone: 'deep', shades: { highlight: '#e8c3ca', base: '#e89bac', hover: '#fba4b8', surface: '#4b2f35', bubble: '#351f24' } },
  { id: 'coral', name: 'Coral', hue: 15, tone: 'pastel', shades: { highlight: '#ffe1e3', base: '#ffbbbf', hover: '#ffc5ca', surface: '#4a3031', bubble: '#352021' } },
  { id: 'clay', name: 'Clay', hue: 15, tone: 'deep', shades: { highlight: '#e8c3c5', base: '#ea9ba1', hover: '#fda5ab', surface: '#4c2f31', bubble: '#361f21' } },
  { id: 'salmon', name: 'Salmon', hue: 25, tone: 'pastel', shades: { highlight: '#ffe2de', base: '#ffbcb5', hover: '#ffc6be', surface: '#4a302e', bubble: '#35201e' } },
  { id: 'terracotta', name: 'Terracotta', hue: 25, tone: 'deep', shades: { highlight: '#e9c4c0', base: '#eb9c96', hover: '#fea69f', surface: '#4c2f2d', bubble: '#361f1d' } },
  { id: 'peach', name: 'Peach', hue: 35, tone: 'pastel', shades: { highlight: '#ffe3da', base: '#ffbeac', hover: '#ffc8b4', surface: '#4a312a', bubble: '#34211c' } },
  { id: 'copper', name: 'Copper', hue: 35, tone: 'deep', shades: { highlight: '#e8c5bb', base: '#ea9e8b', hover: '#fda893', surface: '#4c3029', bubble: '#36201a' } },
  { id: 'lime', name: 'Lime', hue: 115, tone: 'pastel', shades: { highlight: '#eaefd2', base: '#cfd898', hover: '#dce69d', surface: '#373a23', bubble: '#262816' } },
  { id: 'leaf', name: 'Leaf', hue: 115, tone: 'deep', shades: { highlight: '#ccd2b2', base: '#b2bc74', hover: '#bec978', surface: '#373b20', bubble: '#262913' } },
  { id: 'pistachio', name: 'Pistachio', hue: 125, tone: 'pastel', shades: { highlight: '#e5f0d5', base: '#c4db9e', hover: '#cfeaa4', surface: '#333c25', bubble: '#232918' } },
  { id: 'sage', name: 'Sage', hue: 125, tone: 'deep', shades: { highlight: '#c7d3b5', base: '#a6bf7b', hover: '#b1cd81', surface: '#333c23', bubble: '#222a16' } },
  { id: 'clover', name: 'Clover', hue: 135, tone: 'pastel', shades: { highlight: '#e0f1d8', base: '#b9dea6', hover: '#c3edad', surface: '#2f3d28', bubble: '#202a1a' } },
  { id: 'basil', name: 'Basil', hue: 135, tone: 'deep', shades: { highlight: '#c2d5b9', base: '#9ac285', hover: '#a4d08b', surface: '#2e3d26', bubble: '#1f2a18' } },
  { id: 'spring', name: 'Spring', hue: 145, tone: 'pastel', shades: { highlight: '#dcf2dc', base: '#afe0af', hover: '#b7efb7', surface: '#2b3d2c', bubble: '#1c2b1d' } },
  { id: 'fern', name: 'Fern', hue: 145, tone: 'deep', shades: { highlight: '#bdd6bd', base: '#8ec58f', hover: '#96d397', surface: '#2a3e2a', bubble: '#1b2b1b' } },
  { id: 'jade', name: 'Jade', hue: 155, tone: 'pastel', shades: { highlight: '#d8f3e0', base: '#a4e2b9', hover: '#abf1c3', surface: '#283e2f', bubble: '#192b1f' } },
  { id: 'emerald', name: 'Emerald', hue: 155, tone: 'deep', shades: { highlight: '#b9d7c2', base: '#82c79a', hover: '#88d5a3', surface: '#253f2e', bubble: '#172c1f' } },
  { id: 'mint', name: 'Mint', hue: 165, tone: 'pastel', shades: { highlight: '#d5f4e5', base: '#9be3c3', hover: '#a0f3ce', surface: '#243e33', bubble: '#162c22' } },
  { id: 'pine', name: 'Pine', hue: 165, tone: 'deep', shades: { highlight: '#b5d7c7', base: '#76c8a5', hover: '#7bd7b0', surface: '#213f32', bubble: '#142c22' } },
  { id: 'seafoam', name: 'Seafoam', hue: 175, tone: 'pastel', shades: { highlight: '#d2f4ea', base: '#93e4ce', hover: '#97f3da', surface: '#213f37', bubble: '#142c25' } },
  { id: 'lagoon', name: 'Lagoon', hue: 175, tone: 'deep', shades: { highlight: '#b2d7cc', base: '#6dc8b1', hover: '#6fd7bd', surface: '#1d3f37', bubble: '#112c25' } },
  { id: 'aqua', name: 'Aqua', hue: 185, tone: 'pastel', shades: { highlight: '#d0f4ee', base: '#8ee4d8', hover: '#91f3e6', surface: '#1f3e3a', bubble: '#122c28' } },
  { id: 'teal', name: 'Teal', hue: 185, tone: 'deep', shades: { highlight: '#afd7d1', base: '#65c8bc', hover: '#67d7ca', surface: '#1b3f3b', bubble: '#0e2c29' } },
  { id: 'glacier', name: 'Glacier', hue: 195, tone: 'pastel', shades: { highlight: '#cff4f3', base: '#8be3e2', hover: '#8df2f1', surface: '#1e3e3e', bubble: '#112b2b' } },
  { id: 'ocean', name: 'Ocean', hue: 195, tone: 'deep', shades: { highlight: '#aed7d6', base: '#61c7c7', hover: '#62d6d6', surface: '#193f3f', bubble: '#0d2c2c' } },
  { id: 'sky', name: 'Sky', hue: 205, tone: 'pastel', shades: { highlight: '#cff3f7', base: '#8be2eb', hover: '#8df1fc', surface: '#1e3e41', bubble: '#112b2e' } },
  { id: 'cerulean', name: 'Cerulean', hue: 205, tone: 'deep', shades: { highlight: '#aed6db', base: '#61c6d1', hover: '#62d5e1', surface: '#193e42', bubble: '#0d2b2f' } },
  { id: 'ice', name: 'Ice', hue: 215, tone: 'pastel', shades: { highlight: '#cff2fb', base: '#8de0f4', hover: '#90efff', surface: '#1f3d44', bubble: '#122a30' } },
  { id: 'harbor', name: 'Harbor', hue: 215, tone: 'deep', shades: { highlight: '#afd5df', base: '#65c4da', hover: '#66d2eb', surface: '#1b3e46', bubble: '#0e2b31' } },
  { id: 'powder', name: 'Powder', hue: 225, tone: 'pastel', shades: { highlight: '#d1f1ff', base: '#92ddfb', hover: '#96ecff', surface: '#213c47', bubble: '#142a32' } },
  { id: 'denim', name: 'Denim', hue: 225, tone: 'deep', shades: { highlight: '#b1d4e3', base: '#6cc1e2', hover: '#6ecff4', surface: '#1d3d49', bubble: '#102a34' } },
  { id: 'cornflower', name: 'Cornflower', hue: 235, tone: 'pastel', shades: { highlight: '#d4f0ff', base: '#99dbff', hover: '#9ee9ff', surface: '#243b49', bubble: '#162934' } },
  { id: 'azure', name: 'Azure', hue: 235, tone: 'deep', shades: { highlight: '#b4d3e6', base: '#75bee8', hover: '#79ccfb', surface: '#213c4b', bubble: '#132936' } },
  { id: 'periwinkle', name: 'Periwinkle', hue: 245, tone: 'pastel', shades: { highlight: '#d7efff', base: '#a2d8ff', hover: '#a8e5ff', surface: '#273a4b', bubble: '#192835' } },
  { id: 'cobalt', name: 'Cobalt', hue: 245, tone: 'deep', shades: { highlight: '#b7d1e8', base: '#7fbbed', hover: '#85c8ff', surface: '#243a4d', bubble: '#172837' } },
  { id: 'orchid', name: 'Orchid', hue: 305, tone: 'pastel', shades: { highlight: '#f1e5ff', base: '#dec3fe', hover: '#eccfff', surface: '#3c3348', bubble: '#2a2233' } },
  { id: 'amethyst', name: 'Amethyst', hue: 305, tone: 'deep', shades: { highlight: '#d4c7e5', base: '#c2a5e5', hover: '#d1b0f8', surface: '#3d324a', bubble: '#2a2235' } },
  { id: 'mauve', name: 'Mauve', hue: 315, tone: 'pastel', shades: { highlight: '#f5e4fd', base: '#e6c1f8', hover: '#f6cbff', surface: '#3f3246', bubble: '#2c2231' } },
  { id: 'plum', name: 'Plum', hue: 315, tone: 'deep', shades: { highlight: '#d9c6e1', base: '#cba2de', hover: '#dbacf0', surface: '#403147', bubble: '#2d2133' } },
  { id: 'fuchsia', name: 'Fuchsia', hue: 325, tone: 'pastel', shades: { highlight: '#f9e3fa', base: '#eebef0', hover: '#ffc9ff', surface: '#423143', bubble: '#2f212f' } },
  { id: 'magenta', name: 'Magenta', hue: 325, tone: 'deep', shades: { highlight: '#ddc5dd', base: '#d39fd6', hover: '#e4aae6', surface: '#433044', bubble: '#2f2030' } },
  { id: 'peony', name: 'Peony', hue: 335, tone: 'pastel', shades: { highlight: '#fce2f6', base: '#f5bce7', hover: '#ffc7f7', surface: '#453040', bubble: '#30202d' } },
  { id: 'berry', name: 'Berry', hue: 335, tone: 'deep', shades: { highlight: '#e0c4d9', base: '#da9dcc', hover: '#eca7dc', surface: '#462f41', bubble: '#31202d' } },
  { id: 'bubblegum', name: 'Bubblegum', hue: 345, tone: 'pastel', shades: { highlight: '#ffe2f1', base: '#fabbde', hover: '#ffc5ec', surface: '#47303c', bubble: '#32202a' } },
  { id: 'cerise', name: 'Cerise', hue: 345, tone: 'deep', shades: { highlight: '#e3c3d4', base: '#e09cc2', hover: '#f2a5d0', surface: '#482f3d', bubble: '#331f2a' } },
  { id: 'blossom', name: 'Blossom', hue: 355, tone: 'pastel', shades: { highlight: '#ffe1ec', base: '#ffbad4', hover: '#ffc4e1', surface: '#483039', bubble: '#332027' } },
  { id: 'raspberry', name: 'Raspberry', hue: 355, tone: 'deep', shades: { highlight: '#e6c3cf', base: '#e59bb7', hover: '#f7a4c4', surface: '#4a2f39', bubble: '#351f27' } },
  { id: 'cloud', name: 'Cloud', hue: null, tone: 'neutral', shades: { highlight: '#f0f2f3', base: '#dbdee2', hover: '#e3ecf6', surface: '#373839', bubble: '#262627' } },
  { id: 'silver', name: 'Silver', hue: null, tone: 'neutral', shades: { highlight: '#d5d8db', base: '#b8bec5', hover: '#c0ccd9', surface: '#36383b', bubble: '#252729' } },
  { id: 'slate', name: 'Slate', hue: null, tone: 'neutral', shades: { highlight: '#adb2b7', base: '#8f9aa4', hover: '#97a7b7', surface: '#35383d', bubble: '#24272a' } },
  { id: 'stone', name: 'Stone', hue: null, tone: 'neutral', shades: { highlight: '#c6c3c0', base: '#b0aaa3', hover: '#c1b5a9', surface: '#3a3735', bubble: '#282624' } },
]

export const paletteById: Record<string, PaletteColor> = Object.fromEntries(PALETTE.map((c) => [c.id, c]))

/** Used when an activity's colour is missing or unknown. */
export const FALLBACK_COLOR = paletteById.silver

export function paletteColor(id: string | undefined): PaletteColor {
  return (id && paletteById[id]) || FALLBACK_COLOR
}
