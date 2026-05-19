import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BrandCard } from "./components/BrandCard";
import { BrandHeadline } from "./components/BrandHeadline";
import { BrandRule } from "./components/BrandRule";
import { RocketSymbol } from "./components/RocketSymbol";
import { StatsCounter } from "./components/StatsCounter";
import { COLORS, SPRING_CONFIG, montserrat, oswald } from "./theme";

// ─── Cena 1: Hook (0–90) ────────────────────────────────────────────────────
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ background: COLORS.preto, opacity: fadeOut }}>
      {/* Vinheta radial */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 60%, rgba(0,0,0,0.3) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Régua superior */}
      <BrandRule startFrame={0} top="8%" left={56} right={56} />

      {/* Headline */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BrandHeadline
          lines={[
            [{ text: "VOCÊ ESTÁ PERDENDO" }],
            [
              { text: "DINHEIRO", color: COLORS.vermelho },
              { text: "NO SEU DELIVERY?" },
            ],
          ]}
          size={120}
          startFrame={5}
          staggerFrames={10}
          textAlign="center"
        />
      </div>
    </AbsoluteFill>
  );
};

// ─── Cena 2: Problema (90–240) — fundo offWhite ──────────────────────────────
const Scene2: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.offWhite }}>
      {/* Linha arquitetônica superior */}
      <BrandRule startFrame={0} top="8%" left={56} right={56} color={COLORS.preto} />

      {/* Subtítulo */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <BrandHeadline
          lines={[
            [
              { text: "OS 3 PROBLEMAS QUE" },
              { text: "TRAVAM", color: COLORS.vermelho },
              { text: "SEU NEGÓCIO" },
            ],
          ]}
          size={56}
          startFrame={0}
          staggerFrames={0}
          textAlign="center"
          darkMode={false}
        />
      </div>

      {/* 3 cards */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          paddingTop: 140,
        }}
      >
        {[
          {
            title: "PEDIDOS PERDIDOS",
            description: "Sua operação não acompanha o volume.",
            delay: 0,
          },
          {
            title: "INADIMPLÊNCIA ALTA",
            description: "Cobranças manuais ficam pelo caminho.",
            delay: 20,
          },
          {
            title: "ZERO TEMPO PRA ANÁLISE",
            description: "Você opera no escuro, sem métricas.",
            delay: 40,
          },
        ].map((card, i) => (
          <BrandCard
            key={i}
            title={card.title}
            description={card.description}
            startFrame={card.delay}
            borderColor={COLORS.vermelho}
            iconSrc={staticFile("rocket-red.png")}
            titleSize={44}
            width={480}
            height={420}
            lightBg
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ─── Cena 3: Solução / Agentes (240–540) ────────────────────────────────────
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // light-leak pulse
  const pulse = Math.sin(frame * 0.05) * 0.1 + 0.35;

  // Logo entra no centro (0–90), depois sobe (90–)
  const logoEnterProgress = spring({
    frame,
    fps,
    config: SPRING_CONFIG,
  });

  const logoMoveProgress = spring({
    frame: frame - 90,
    fps,
    config: SPRING_CONFIG,
  });

  const logoY = interpolate(logoMoveProgress, [0, 1], [50, 10]);
  const logoScale = interpolate(logoEnterProgress, [0, 1], [0, 1]);

  const textStart = 90;
  const cardsStart = 120;

  const textOpacity = interpolate(frame - textStart, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: COLORS.preto }}>
      {/* Light-leak vermelho */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 60% 60% at 0% 100%, rgba(183,12,0,${pulse}) 0%, transparent 70%)`,
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <div
        style={{
          position: "absolute",
          top: `${logoY}%`,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `scale(${logoScale})`,
          opacity: logoEnterProgress,
        }}
      >
        <Img
          src={staticFile("logo-white.png")}
          style={{ height: 120, objectFit: "contain" }}
        />
      </div>

      {/* Subtítulo */}
      <div
        style={{
          position: "absolute",
          top: "22%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: textOpacity,
        }}
      >
        <BrandHeadline
          lines={[
            [
              { text: "CONHEÇA NOSSOS" },
              { text: "AGENTES", color: COLORS.vermelho },
              { text: "DE IA" },
            ],
          ]}
          size={64}
          startFrame={0}
          staggerFrames={0}
          textAlign="center"
        />
      </div>

      {/* Cards de agentes */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 48,
        }}
      >
        {[
          {
            title: "DELI",
            description: "SEU COO DIGITAL 24/7",
            delay: cardsStart,
          },
          {
            title: "CORA",
            description: "COBRANÇA AUTOMATIZADA VIA WHATSAPP",
            delay: cardsStart + 30,
          },
          {
            title: "ANALISTA IFOOD",
            description: "DIAGNÓSTICO DA SUA LOJA EM TEMPO REAL",
            delay: cardsStart + 60,
          },
        ].map((card, i) => (
          <AgentCard
            key={i}
            title={card.title}
            description={card.description}
            startFrame={card.delay}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const AgentCard: React.FC<{
  title: string;
  description: string;
  startFrame: number;
}> = ({ title, description, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: SPRING_CONFIG,
  });

  const translateY = interpolate(progress, [0, 1], [60, 0]);
  const scaleV = interpolate(progress, [0, 1], [0.9, 1]);

  return (
    <div
      style={{
        width: 500,
        background: "#161616",
        border: `1.5px solid ${COLORS.branco}`,
        borderRadius: 4,
        padding: "36px 36px 36px 52px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transform: `translateY(${translateY}px) scale(${scaleV})`,
        opacity: progress,
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Barra vertical vermelha */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: COLORS.vermelho,
          borderRadius: "4px 0 0 4px",
        }}
      />
      {/* Foguete pequeno */}
      <RocketSymbol variant="red" size={40} />
      {/* Nome do agente */}
      <div
        style={{
          fontFamily: oswald,
          fontSize: title === "ANALISTA IFOOD" ? 44 : 52,
          fontWeight: 700,
          color: COLORS.vermelho,
          textTransform: "uppercase",
          lineHeight: 1.0,
        }}
      >
        {title}
      </div>
      {/* Descrição */}
      <div
        style={{
          fontFamily: montserrat,
          fontSize: 20,
          fontWeight: 500,
          color: COLORS.branco,
          lineHeight: 1.3,
        }}
      >
        {description}
      </div>
    </div>
  );
};

// ─── Cena 4: Stats (540–750) ─────────────────────────────────────────────────
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Wipe do preto pro vermelho
  const wipeProgress = spring({
    frame,
    fps,
    config: SPRING_CONFIG,
  });
  const wipeClip = interpolate(wipeProgress, [0, 1], [100, 0]);

  return (
    <AbsoluteFill>
      {/* Fundo preto embaixo */}
      <AbsoluteFill style={{ background: COLORS.preto }} />
      {/* Vermelho entrando via wipe */}
      <AbsoluteFill
        style={{
          background: COLORS.vermelho,
          clipPath: `inset(0 ${wipeClip}% 0 0)`,
        }}
      />

      {/* Vinheta nos cantos */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 120% 120% at 50% 50%, transparent 55%, rgba(138,9,0,0.4) 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Título */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(frame, [10, 30], [0, 1], {
            extrapolateRight: "clamp",
          }),
        }}
      >
        <BrandHeadline
          lines={[[{ text: "RESULTADOS QUE FALAM POR SI", color: COLORS.branco }]]}
          size={56}
          startFrame={0}
          staggerFrames={0}
          textAlign="center"
        />
      </div>

      {/* Stats */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          paddingTop: 60,
        }}
      >
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <StatsCounter
            prefix="+"
            suffix="%"
            value={30}
            label="FATURAMENTO"
            startFrame={20}
          />
        </div>
        <div style={{ width: 1, height: "60%", background: COLORS.branco, opacity: 0.6 }} />
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <StatsCounter
            prefix="-"
            suffix="%"
            value={50}
            label="INADIMPLÊNCIA"
            startFrame={45}
          />
        </div>
        <div style={{ width: 1, height: "60%", background: COLORS.branco, opacity: 0.6 }} />
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <StatsCounter
            prefix=""
            suffix="h/7"
            value={24}
            label="OPERAÇÃO AUTOMATIZADA"
            startFrame={70}
            isStatic
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Cena 5: CTA (750–900) — fundo branco ───────────────────────────────────
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Wipe de volta ao branco (saindo do vermelho da cena 4)
  const wipeProgress = spring({ frame, fps, config: SPRING_CONFIG });
  const wipeClip = interpolate(wipeProgress, [0, 1], [100, 0]);

  const logoProgress = spring({
    frame: frame - 10,
    fps,
    config: SPRING_CONFIG,
  });
  const logoScale = interpolate(logoProgress, [0, 1], [0.7, 1]);

  const ctaFade = interpolate(frame - 20, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pulse CTA
  const pulsePeriod = 60;
  const pulseT = (frame % pulsePeriod) / pulsePeriod;
  const pulseScale = 1 + 0.04 * Math.sin(pulseT * Math.PI * 2);

  return (
    <AbsoluteFill>
      {/* Vermelho embaixo (vem da cena 4) */}
      <AbsoluteFill style={{ background: COLORS.vermelho }} />
      {/* Branco entrando via wipe */}
      <AbsoluteFill
        style={{
          background: COLORS.branco,
          clipPath: `inset(0 ${wipeClip}% 0 0)`,
        }}
      />

      {/* Régua superior preta */}
      <BrandRule startFrame={5} top="8%" left={56} right={56} color={COLORS.preto} />
      {/* Régua inferior preta */}
      <BrandRule startFrame={15} top="92%" left={56} right={56} color={COLORS.preto} />

      {/* Logo colorida (foguete vermelho + wordmark preto) */}
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `scale(${logoScale})`,
          opacity: logoProgress,
        }}
      >
        <Img
          src={staticFile("logo-color.png")}
          style={{ height: 140, objectFit: "contain" }}
        />
      </div>

      {/* Headline CTA */}
      <div
        style={{
          position: "absolute",
          top: "42%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: ctaFade,
        }}
      >
        <BrandHeadline
          lines={[
            [{ text: "AGENDE SUA" }],
            [
              { text: "DEMO" },
              { text: "GRÁTIS", color: COLORS.vermelho },
            ],
          ]}
          size={96}
          startFrame={0}
          staggerFrames={10}
          textAlign="center"
          darkMode={false}
        />
      </div>

      {/* Pílula CTA */}
      <div
        style={{
          position: "absolute",
          bottom: "18%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: ctaFade,
        }}
      >
        <div
          style={{
            border: `1.5px solid ${COLORS.vermelho}`,
            borderRadius: 999,
            padding: "24px 56px",
            transform: `scale(${pulseScale})`,
          }}
        >
          <span
            style={{
              fontFamily: oswald,
              fontSize: 40,
              fontWeight: 700,
              color: COLORS.vermelho,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            APP.CONSULTDELIVERY.COM.BR
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Composição principal ────────────────────────────────────────────────────
export const ConsultDeliveryPitch: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.preto }}>
      {/* Trilha de fundo */}
      <Audio src={staticFile("bg-music.mp3")} volume={0.35} />

      <Sequence from={0} durationInFrames={90}>
        <Scene1 />
      </Sequence>

      <Sequence from={90} durationInFrames={150}>
        <Scene2 />
      </Sequence>

      <Sequence from={240} durationInFrames={300}>
        <Scene3 />
      </Sequence>

      <Sequence from={540} durationInFrames={210}>
        <Scene4 />
      </Sequence>

      <Sequence from={750} durationInFrames={150}>
        <Scene5 />
      </Sequence>
    </AbsoluteFill>
  );
};
