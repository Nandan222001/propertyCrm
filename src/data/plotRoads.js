/**
 * Road details of the Real Life City Plot Layout, printed on the map: the road widths (red on the drawing) and the
 * khesara numbers (green) — in the same coordinate space as plotLayout.js (feet, z grows downwards).
 *
 * angle is 0 for text that reads left to right and 90 for text that reads bottom to top (the vertical roads).
 * Every label stands where it is on the printed layout (positions read off the photo and fitted to the plot
 * coordinates, about 3 ft accurate), so a few khesara numbers cross plots just as they do on the paper.
 * Only the roads and khesara numbers visible on that print are listed here.
 */
export const PLOT_MAP_LABELS = [
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 274.6, z: 157.7, angle: 0 },
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 483.0, z: 152.2, angle: 0 },
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 274.4, z: 232.5, angle: 0 },
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 484.0, z: 229.7, angle: 0 },
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 273.3, z: 307.7, angle: 0 },
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 477.1, z: 306.2, angle: 0 },
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 418.3, z: 385.0, angle: 0 },
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 333.3, z: 462.8, angle: 0 },
  { kind: 'road', text: "23.5'-0\" WIDE ROAD", x: 593.6, z: 216.3, angle: 90 },
  { kind: 'road', text: "30'-0\" WIDE ROAD", x: 342.4, z: 209.3, angle: 90 },
  { kind: 'road', text: "30'-0\" WIDE ROAD", x: 341.0, z: 515.0, angle: 90 },
  { kind: 'road', text: "30'-0\" WIDE ROAD", x: 342.1, z: 694.2, angle: 90 },
  { kind: 'khesara', text: "KHESARA - 1158", x: 600.4, z: 88.0, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 857", x: 342.6, z: 159.7, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 858", x: 220.4, z: 222.9, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1159", x: 540.5, z: 223.8, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1163", x: 466.6, z: 249.6, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1162", x: 534.8, z: 249.2, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1167", x: 309.1, z: 301.5, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1164", x: 399.9, z: 301.2, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1161", x: 491.7, z: 314.2, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1165", x: 400.3, z: 341.4, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1144", x: 504.0, z: 369.8, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1168", x: 279.1, z: 385.2, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1166", x: 342.8, z: 384.0, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1142", x: 430.7, z: 391.8, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1143", x: 482.8, z: 392.7, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1169", x: 325.0, z: 420.0, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1170", x: 322.3, z: 454.8, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1141", x: 395.6, z: 426.8, angle: 0 },
  { kind: 'khesara', text: "KHESARA - 1171", x: 339.5, z: 590.6, angle: 90 },
  { kind: 'khesara', text: "KHESARA - 1176", x: 284.6, z: 476.2, angle: 90 },
];

export default PLOT_MAP_LABELS;
