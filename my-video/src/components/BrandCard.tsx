import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, SPRING_CONFIG, montserrat, oswald } from "../theme";

interface BrandCardProps {
  title: string;
  description: string;
  startFrame?: number;
  borderColor?: string;
  accentBar?: boolean;
  iconSrc?: string;
  titleSize?: number;
  width?: number;
  height?: number;
  lightBg?: boolean;
}

export const BrandCard: React.FC<BrandCardProps> = ({
  title,
  description,
  startFrame = 0,
  borderColor = COLORS.vermelho,
  accentBar = false,
  iconSrc,
  titleSize = 44,
  width = 480,
  height = 420,
  lightBg = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: SPRING_CONFIG,
  });

  const translateX = interpolate(progress, [0, 1], [-80, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return (
    <div
      style={{
        width,
        minHeight: height,
        background: lightBg ? COLORS.branco : "#161616",
        border: `1.5px solid ${borderColor}`,
        borderRadius: 4,
        padding: 40,
        display: "flex",
        flexDirection: "row",
        transform: `translateX(${translateX}px)`,
        opacity,
        position: "relative",
        overflow: "visible",
        boxSizing: "border-box",
      }}
    >
      {accentBar && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            background: COLORS.vermelho,
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: accentBar ? 20 : 0,
          gap: 16,
        }}
      >
        {iconSrc && (
          <img
            src={iconSrc}
            style={{ width: 64, height: 64, objectFit: "contain" }}
            alt=""
          />
        )}
        <div
          style={{
            fontFamily: oswald,
            fontSize: titleSize,
            fontWeight: 700,
            color: lightBg ? COLORS.preto : COLORS.branco,
            textTransform: "uppercase",
            lineHeight: 1.0,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: montserrat,
            fontSize: 22,
            fontWeight: 500,
            color: lightBg ? COLORS.vermelhoEscuro : COLORS.offWhite,
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
};
