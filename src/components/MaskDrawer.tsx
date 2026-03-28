import React, { useRef } from 'react';
import { Group, Line, Rect } from 'react-konva';

interface MaskDrawerProps {
  width: number;
  height: number;
  brushSize: number;
  lines: any[];
  setLines: (lines: any[]) => void;
  isVisible: boolean;
}

export const MaskDrawer: React.FC<MaskDrawerProps> = ({
  width,
  height,
  brushSize,
  lines,
  setLines,
  isVisible,
}) => {
  const isDrawing = useRef(false);

  const handleMouseDown = (e: any) => {
    if (!isVisible) return;
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { tool: 'pen', points: [pos.x, pos.y], strokeWidth: brushSize }]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current || !isVisible) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const newLines = lines.slice();
    let lastLine = { ...newLines[newLines.length - 1] };

    lastLine.points = lastLine.points.concat([point.x, point.y]);
    newLines.splice(newLines.length - 1, 1, lastLine);
    setLines(newLines);
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  if (!isVisible) return null;

  return (
    <Group
      id="mask-group"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Background overlay and event catcher */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="rgba(49, 49, 49, 0)"
        listening={isVisible}
      />
      {lines.map((line, i) => (
        <Line
          key={i}
          points={line.points}
          stroke="#ffffffff"
          strokeWidth={line.strokeWidth}
          tension={0.5}
          lineCap="round"
          lineJoin="round"
          listening={false}
          globalCompositeOperation={
            line.tool === 'eraser' ? 'destination-out' : 'source-over'
          }
        />
      ))}
    </Group>
  );
};
