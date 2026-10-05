// The bowl as Figma draws it (5:2025, the full-bowl frame, 361 x 160): every coordinate below is in that
// frame, y down. The track is the lower half of an elliptical ring about (181, 19) with a round rim at each
// end, so its walls are written as ellipses rather than sampled: the physics collides with the same curves
// the track path draws.

export const BOWL_WIDTH = 361;
export const BOWL_HEIGHT = 160;
/** Room drawn above the frame, where new balls appear before they fall in. */
export const BOWL_HEADROOM = 40;

/** The track: a thick U whose outer and inner edges are quarter-ellipse Beziers about (181, 19). */
export const TRACK_PATH =
  'M31 19C31 13.4772 35.7969 9 41.7143 9C47.6316 9 52.4286 13.4772 52.4286 19C52.4286 85.2742 109.992 139 181 139' +
  'C252.008 139 309.571 85.2742 309.571 19C309.571 13.4772 314.368 9 320.286 9C326.203 9 331 13.4772 331 19' +
  'C331 96.3199 263.843 159 181 159C98.1573 159 31 96.3199 31 19Z';

/** The track's centre line from its left end, round the bottom, to its right end: the mean of its edges. */
export const TRACK_MIDLINE_PATH =
  'M41.7143 19C41.7143 90.7971 104.0745 149 181 149C257.9255 149 320.2857 90.7971 320.2857 19';

export const TRACK_STROKE_WIDTH = 20;

/** The centre of the track's ellipses, on the line through both rims. */
export const BOWL_CENTRE_X = 181;
export const RIM_Y = 19;

export const INNER_RADIUS_X = 128.5714;
export const INNER_RADIUS_Y = 120;
export const OUTER_RADIUS_X = 150;
export const OUTER_RADIUS_Y = 140;

/** Each rim is the round end of the track, centred on its centre line. */
export const RIM_RADIUS = 10.5;
export const RIM_CENTRE_LEFT_X = 41.7143;
export const RIM_CENTRE_RIGHT_X = 320.2857;

/** The ground the spill lands on: the frame's bottom edge, level with the bowl's base. */
export const GROUND_Y = BOWL_HEIGHT;
