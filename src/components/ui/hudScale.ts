// The HUD's pixel scale: how many screen pixels one art pixel of the hotbar,
// the vitals and the readouts stacked above them takes. That part of the HUD is
// drawn on an art-pixel grid (a slot is 24 art pixels, the item in it 16, a
// heart 11), so every piece keeps its proportions and pixel art stays on whole
// pixels. It is the HUD's original size at every window size: a 480px hotbar of
// 48px slots holding 32px items.
export const HUD_SCALE = 2;
