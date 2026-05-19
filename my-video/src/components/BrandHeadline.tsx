import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, SPRING_CONFIG, oswald } from "../theme";

type Word = { text: string; color?: string };

interface BrandHeadlineProps {
  lines: Word[][];
  size?: number;
  startFrame?: number;
  staggerFrames?: number;
  textAlign?: "center" | "left" | "right";
  darkMode?: boolean;
}

export const BrandHeadline: React.FC<BrandHeadlineProps> = ({
  lines,
  size = 120,
  startFrame = 0,
  staggerFrames = 10,
  textAlign = "center",
  darkMode = true,
}) => {
  const defaultColor = darkMode ? COLORS.branco : COLORS.preto;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ textAlign }}>
      {lines.map((words, lineIndex) => {
        const lineStart = startFrame + lineIndex * staggerFrames;
        const progress = spring({
          frame: frame - lineStart,
          fps,
          config: SPRING_CONFIG,
        });
        const clipY = interpolate(progress, [0, 1], [100, 0]);

        return (
          <div
            key={lineIndex}
            style={{
              overflow: "hidden",
              // Padding extra garante que topos de maiúsculas não sejam cortados
              paddingTop: Math.round(size * 0.08),
              paddingBottom: Math.round(size * 0.04),
              marginBottom: lineIndex < lines.length - 1 ? size * 0.06 : 0,
            }}
          >
            <div
              style={{
                transform: `translateY(${clipY}%)`,
                fontFamily: oswald,
                fontSize: size,
                fontWeight: 700,
                lineHeight: 1,
                textTransform: "uppercase",
                letterSpacing: 0,
                display: "block",
              }}
            >
              {words.map((word, wi) => (
                <span
                  key={wi}
                  style={{
                    color: word.color ?? defaultColor,
                    marginRight: wi < words.length - 1 ? "0.25em" : 0,
                  }}
                >
                  {word.text}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
