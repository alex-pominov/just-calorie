import { weekGeometry } from './week-geometry';

const rightEdge = ({ cellWidth, columnXs }: ReturnType<typeof weekGeometry>) => (columnXs.at(-1) ?? 0) + cellWidth;

describe('weekGeometry', () => {
  it('reproduces frame 9:3396 at 393pt, with 48pt columns 8pt apart and 4pt in from the edge', () => {
    const geometry = weekGeometry(393);

    expect([geometry.cellWidth, geometry.gap, geometry.inset]).toEqual([48, 8, 4]);
    expect(geometry.columnXs).toEqual([4, 60, 116, 172, 228, 284, 340]);
  });

  it.each([402, 430, 440])('keeps 48pt columns and centres them, to the whole point, on a %ppt screen', (width) => {
    const geometry = weekGeometry(width);

    const leftMargin = geometry.inset;
    const rightMargin = width - rightEdge(geometry);

    expect(geometry.cellWidth).toBe(48);
    expect(Math.abs(rightMargin - leftMargin)).toBeLessThanOrEqual(1);
  });

  it('narrows the columns on a 375pt screen so the whole week fits inside 4pt edges', () => {
    const geometry = weekGeometry(375);

    expect(geometry.cellWidth).toBeLessThan(48);
    expect(geometry.inset).toBe(4);
    expect(rightEdge(geometry)).toBeCloseTo(371, 5);
  });

  it.each([375, 393, 402, 440])('never lets the week run past a %ppt screen', (width) => {
    const geometry = weekGeometry(width);

    expect(geometry.columnXs).toHaveLength(7);
    expect(geometry.columnXs[0]).toBe(geometry.inset);
    expect(rightEdge(geometry)).toBeLessThanOrEqual(width - geometry.inset);
  });
});
