import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, SPRING_CONFIG, montserrat, oswald } from "../theme";

interface StatsCounterProps {
  prefix?: string;
  suffix?: string;
  value: number;
  label: string;
  startFrame?: number;
  isStatic?: boolean;
}

export const StatsCounter: React.FC<StatsCounterProps> = ({
  prefix = "",
  suffix = "",
  value,
  label,
  startFrame = 0,
  isStatic = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame: frame - startFrame,
    fps,
    config: SPRING_CONFIG,
  });

  const counterProgress = interpolate(
    frame - startFrame,
    [0, 60],
    [0, 1],
    {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );

  const displayValue = isStatic
    ? suffix
    : `${prefix}${Math.round(counterProgress * value)}${suffix}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: `scale(${interpolate(entryProgress, [0, 1], [0.7, 1])})`,
        opacity: entryProgress,
      }}
    >
      <div
        style={{
          fontFamily: oswald,
          fontSize: 160,
          fontWeight: 700,
          color: COLORS.branco,
          lineHeight: 1,
        }}
      >
        {displayValue}
      </div>
      <div
        style={{
          fontFamily: montserrat,
          fontSize: 36,
          fontWeight: 500,
          color: COLORS.branco,
          textTransform: "uppercase",
          letterSpacing: 4,
          marginTop: 16,
        }}
      >
        {label}
      </div>
    </div>
  );
};
