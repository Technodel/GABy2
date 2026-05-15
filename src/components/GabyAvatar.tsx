// GABy Avatar component — logo image in a circle
export default function GabyAvatar({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/GABy.png"
      alt="GABy"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
  );
}
