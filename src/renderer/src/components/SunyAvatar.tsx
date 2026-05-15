// SUNy Avatar component — logo image in a circle
export default function SunyAvatar({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/SLOGO.png"
      alt="SUNy"
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
