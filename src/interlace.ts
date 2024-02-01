type Interlacing = {
  xFactor: number;
  yFactor: number;
  xOffset: number;
  yOffset: number;
};

export const interlacing: Interlacing[] = [
  { xFactor: 8, yFactor: 8, xOffset: 0, yOffset: 0 },
  { xFactor: 8, yFactor: 8, xOffset: 4, yOffset: 0 },
  { xFactor: 4, yFactor: 8, xOffset: 0, yOffset: 4 },
  { xFactor: 4, yFactor: 4, xOffset: 2, yOffset: 0 },
  { xFactor: 2, yFactor: 4, xOffset: 0, yOffset: 2 },
  { xFactor: 2, yFactor: 2, xOffset: 1, yOffset: 0 },
  { xFactor: 1, yFactor: 2, xOffset: 0, yOffset: 1 },
];
