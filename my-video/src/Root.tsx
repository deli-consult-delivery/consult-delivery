import "./index.css";
import { Composition } from "remotion";
import { ConsultDeliveryPitch } from "./ConsultDeliveryPitch";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ConsultDeliveryPitch"
      component={ConsultDeliveryPitch}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
