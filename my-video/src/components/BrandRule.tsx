import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, SPRING_CONFIG } from "../theme";

interface BrandRuleProps {
  startFrame?: number;
  top?: string | number;
  left?: number;
  right?: number;
  color?: string;
}

export const BrandRule: React.FC<BrandRuleProps> = ({
  startFrame = 0,
  top = "8%",
  left = 56,
  right = 56,
  color = COLORS.branco,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: SPRING_CONFIG,
  });
  const clipRight = interpolate(progress, [0, 1], [100, 0]);

  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        right,
        height: 1,
        background: color,
        clipPath: `inset(0 ${clipRight}% 0 0)`,
      }}
    />
  );
};
